import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { Twilio } from "twilio";
import { defineString } from "firebase-functions/params";
import { Request, Response } from "express";

// Importar triggers de workflow
export * from "./workflowTriggers";

admin.initializeApp();
const db = admin.firestore();

// Define config parameters
const nodemailerUser = defineString("NODEMAILER_USER");
const nodemailerPass = defineString("NODEMAILER_PASS");
const twilioSid = defineString("TWILIO_SID");
const twilioToken = defineString("TWILIO_TOKEN");

// Inicialização será feita dentro da função para evitar problemas com params

// Utils de formatação/segurança
const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const truncate = (s: string, max = 600) => (s.length > max ? s.slice(0, max) + "…" : s);

// Função utilitária para transformar respostas em texto legível (sem [object Object])
function formatAnswerValue(answer: any, field?: any): string {
  // Null/undefined
  if (answer == null) return '';
  
  // Assinatura (imagem base64)
  if (typeof answer === 'string' && answer.startsWith('data:image')) {
    return '[Assinatura anexada]';
  }
  
  // Outros data URLs longos
  if (typeof answer === 'string' && answer.startsWith('data:')) {
    return '[Arquivo incorporado]';
  }
  
  // Tabela será tratada no HTML (retorna marcador)
  if (field && field.type === 'Tabela' && typeof answer === 'object' && answer !== null) {
    return '__TABLE__';
  }
  
  // Arrays
  if (Array.isArray(answer)) {
    if (answer.length === 0) return '';
    
    // Array de primitivos
    if (answer.every((x) => x == null || ['string','number','boolean'].includes(typeof x))) {
      return answer.map((x) => {
        if (x == null) return '';
        if (typeof x === 'boolean') return x ? 'Sim' : 'Não';
        return String(x);
      }).filter(Boolean).join(', ');
    }
    
    // Array de objetos (imagens/arquivos ou pares label/valor)
    return answer.map((it: any, i: number) => {
      if (!it) return '';
      
      // Imagem/arquivo
      if (typeof it === 'object' && (it.type?.startsWith?.('image') || it.url)) {
        const name = it.name || `Arquivo ${i + 1}`;
        const url = it.url ? ` (${it.url})` : '';
        return `${name}${url}`;
      }
      
      // Objeto com propriedades conhecidas
      if (typeof it === 'object') {
        // Tenta extrair valor de propriedades comuns
        const label = it.label || it.question || it.name || it.title;
        const value = it.value ?? it.answer ?? it.response ?? it.text ?? it.content;
        
        if (label && value != null) {
          return `${label}: ${formatAnswerValue(value)}`;
        }
        
        // Se tem apenas um valor, retorna ele
        if (value != null) {
          return formatAnswerValue(value);
        }
        
        // Tenta extrair propriedades úteis do objeto
        const keys = Object.keys(it).filter(k => !['id', '_id', 'timestamp', 'createdAt', 'updatedAt'].includes(k));
        if (keys.length === 1) {
          return formatAnswerValue(it[keys[0]]);
        }
        
        // Formata objeto como chave: valor
        const formatted = keys.map(key => {
          const val = it[key];
          if (val != null && val !== '') {
            return `${key}: ${formatAnswerValue(val)}`;
          }
          return null;
        }).filter(Boolean).join(', ');
        
        return formatted || `[Objeto: ${keys.join(', ')}]`;
      }
      
      // Primitivo
      return formatAnswerValue(it);
    }).filter(Boolean).join('\n');
  }
  
  // Boolean
  if (typeof answer === 'boolean') return answer ? 'Sim' : 'Não';
  
  // Number
  if (typeof answer === 'number') return String(answer);
  
  // String
  if (typeof answer === 'string') return truncate(answer);
  
  // Objeto
  if (typeof answer === 'object' && answer !== null) {
    // Arquivo com URL
    if (answer.url) {
      const name = answer.name || answer.filename || 'Arquivo';
      return `${name} (${answer.url})`;
    }
    
    // Objeto com propriedades de texto
    if (answer.text || answer.content || answer.value) {
      return formatAnswerValue(answer.text || answer.content || answer.value);
    }
    
    // Objeto com label e value
    if (answer.label && answer.value != null) {
      return `${answer.label}: ${formatAnswerValue(answer.value)}`;
    }
    
    // Tenta extrair propriedades úteis
    const keys = Object.keys(answer).filter(k => !['id', '_id', 'timestamp', 'createdAt', 'updatedAt'].includes(k));
    
    if (keys.length === 0) return '[Objeto vazio]';
    
    if (keys.length === 1) {
      const value = answer[keys[0]];
      return formatAnswerValue(value);
    }
    
    // Múltiplas propriedades - formata como lista
    const formatted = keys.map(key => {
      const value = answer[key];
      if (value != null && value !== '') {
        if (typeof value === 'object') {
          return `${key}: ${formatAnswerValue(value)}`;
        }
        return `${key}: ${String(value)}`;
      }
      return null;
    }).filter(Boolean).join(', ');
    
    return formatted || '[Objeto sem dados legíveis]';
  }
  
  // Fallback para outros tipos
  return String(answer);
}

// Gera o HTML do e-mail igual ao site
function generateBravoformEmailHTML(formData: any, responseData: any): string {
  const CARD_BG = '#F8F9FA';         // Fundo levemente cinza
  const ACCENT = '#B8860B';          // Dourado mais escuro para melhor contraste
  const ACCENT_LIGHT = '#F4E4BC';    // Dourado claro para alternância
  const TEXT = '#212529';            // Texto quase preto
  const SUBTEXT = '#6C757D';         // Texto secundário cinza médio
  const BORDER = '#DEE2E6';          // Bordas cinza claro

  const fields = Array.isArray(formData.fields) ? formData.fields : [];

  const rowsHtml = fields.map((field: any) => {
    const label = field?.label || field?.id;
    if (!label || label === 'Assinatura') return '';
    const raw = responseData?.answers?.[field?.id];
    
    // Debug log para entender o que está sendo processado
    console.log(`Processando campo "${label}":`, {
      fieldId: field?.id,
      fieldType: field?.type,
      rawValue: raw,
      rawType: typeof raw,
      isArray: Array.isArray(raw),
      isObject: typeof raw === 'object' && raw !== null
    });
    
    const formatted = formatAnswerValue(raw, field);

    // Tabela (renderização própria)
    if (formatted === '__TABLE__') {
      const rows = field.rows || [];
      const cols = field.columns || [];
      const tableRows = rows.map((r: any) => {
        const cells = cols.map((c: any) => {
          const v = raw?.[r.id]?.[c.id] ?? '';
          const vs = escapeHtml(String(v ?? ''));
          return `<td style="padding:8px 10px;border-bottom:1px solid ${ACCENT}33;color:${TEXT};font-size:13px;">${vs}</td>`;
        }).join('');
        const rlabel = escapeHtml(String(r.label ?? r.id ?? ''));
        return `<tr>
          <th style="padding:8px 10px;border-bottom:1px solid ${ACCENT};color:${ACCENT};text-align:left;font-size:12px;background:${CARD_BG};">${rlabel}</th>
          ${cells}
        </tr>`;
      }).join('');

      const header = `<tr>
        <th style="width:28%;padding:12px 15px;background:${ACCENT};color:#FFFFFF;text-align:left;border:1px solid ${BORDER};font-weight:600;font-size:14px;">Linha</th>
        ${cols.map((c:any)=>`<th style=\"padding:12px 15px;background:${ACCENT};color:#FFFFFF;text-align:left;border:1px solid ${BORDER};font-weight:600;font-size:14px;\">${escapeHtml(String(c.label||c.id))}</th>`).join('')}
      </tr>`;

      return `
        <tr>
          <td style="vertical-align:top;padding:12px 14px;border-bottom:1px solid ${ACCENT}40;color:${ACCENT};font-weight:600;">${escapeHtml(String(label))}</td>
          <td style="padding:6px 0 12px;border-bottom:1px solid ${ACCENT}40;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:${CARD_BG};border:1px solid ${ACCENT}40;border-radius:6px;overflow:hidden;">
              <thead>${header}</thead>
              <tbody>${tableRows}</tbody>
            </table>
          </td>
        </tr>
      `;
    }

    const safe = escapeHtml(String(formatted || ''))
      .replace(/\n/g, '<br>');
    return `
      <tr>
        <td colspan="2" style="padding:0;border:1px solid ${BORDER};">
          <div style="padding:10px 15px;background:${ACCENT};color:#FFFFFF;font-weight:600;font-size:14px;margin:0;">${escapeHtml(String(label))}</div>
          <div style="padding:12px 15px;background:#FFFFFF;color:${TEXT};font-size:14px;line-height:1.5;margin:0;min-height:20px;">${safe || '—'}</div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body { font-family: 'Inter', Arial, sans-serif; margin: 0; padding: 20px; background: #E9ECEF; }
        .container { max-width: 800px; margin: 0 auto; background: #FFFFFF; border: 1px solid ${BORDER}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { padding: 25px 20px; background: ${ACCENT_LIGHT}; border-bottom: 3px solid ${ACCENT}; text-align: center; }
        .logo-section { display: flex; align-items: center; justify-content: center; margin-bottom: 15px; }
        .title { margin: 0; color: ${TEXT}; font-family: 'Inter', Arial, sans-serif; font-size: 22px; font-weight: 700; }
        .subtitle { margin: 8px 0 0; color: ${SUBTEXT}; font-size: 15px; font-weight: 500; }
        .form-title { margin: 10px 0 0; color: ${TEXT}; font-size: 17px; font-weight: 600; padding: 10px 15px; background: #FFFFFF; border-radius: 6px; border: 1px solid ${BORDER}; }
        .table { width: 100%; border-collapse: collapse; margin: 0; border-spacing: 0; }
        .content { padding: 15px; background: ${CARD_BG}; }
        .footer { padding: 20px; background: ${ACCENT_LIGHT}; border-top: 1px solid ${BORDER}; color: ${SUBTEXT}; font-size: 13px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo-section">
            <div style="width: 40px; height: 40px; background: ${ACCENT}; border-radius: 6px; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
              <span style="color: #FFFFFF; font-weight: bold; font-size: 16px;">B</span>
            </div>
            <div>
              <div class="title">BRAVOFORM</div>
              <div class="subtitle">Nova resposta recebida</div>
            </div>
          </div>
          <div class="form-title">${escapeHtml(String(formData.title || ''))}</div>
        </div>
        <div class="content">
          <table class="table" cellpadding="0" cellspacing="0" role="presentation">
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
        <div class="footer">
          Este é um e-mail automático enviado pela plataforma BRAVOFORM.
        </div>
      </div>
    </body>
    </html>
  `;
}

// Gera mensagem detalhada para WhatsApp
function generateWhatsappMessage(formData: any, responseData: any): string {
  const fields = formData.fields || [];
  let messageBody = `📝 *Nova resposta recebida para o formulário: "${formData.title}"*\n\n`;
  
  for (const field of fields) {
    const label = field.label || field.id;
    const answer = responseData.answers?.[field.id] ?? '';
    if (label === 'Assinatura') continue;
    
    console.log(`WhatsApp - Processando campo "${label}":`, {
      fieldId: field.id,
      fieldType: field.type,
      rawValue: answer,
      rawType: typeof answer
    });
    
    const formatted = formatAnswerValue(answer, field);
    
    // Para WhatsApp, evita quebras de linha excessivas em tabelas
    if (formatted === '__TABLE__') {
      messageBody += `*${label}:* [Tabela - veja detalhes no email]\n`;
    } else if (formatted && formatted.trim()) {
      // Limita o tamanho para WhatsApp e remove quebras excessivas
      const cleanFormatted = formatted.replace(/\n+/g, ' | ').substring(0, 300);
      messageBody += `*${label}:* ${cleanFormatted}\n`;
    }
  }
  
  return messageBody;
}

// Firestore Trigger
export const onNewFormResponse = onDocumentCreated(
  "forms/{formId}/responses/{responseId}",
  async (event: any) => {
    const responseData = event.data?.data();
    const formId = event.params.formId;

    if (!responseData) {
      console.log("Dados da resposta não encontrados.");
      return null;
    }

    try {
      const formDoc = await db.collection("forms").doc(formId).get();
      const formData = formDoc.data();

      if (!formData || !formData.automation) {
        console.log(`Formulário ${formId} não encontrado ou sem automação.`);
        return null;
      }

      const { type, target } = formData.automation;

      if (!target) {
        console.log("Nenhum alvo de notificação definido (e-mail/whatsapp).");
        return null;
      }

      if (type === "email") {
        // Inicializa o transporte de email dentro da função
        const mailTransport = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: nodemailerUser.value(),
            pass: nodemailerPass.value(),
          },
        });

        const htmlBody = generateBravoformEmailHTML(formData, responseData);
        const mailOptions = {
          from: `"BRAVOFORM" <${nodemailerUser.value()}>`,
          to: target,
          subject: `Nova Resposta Recebida: ${formData.title}`,
          html: htmlBody,
        };
        console.log(`Enviando e-mail para ${target}...`);
        await mailTransport.sendMail(mailOptions);
        console.log("E-mail enviado com sucesso!");

      } else if (type === "whatsapp") {
        // Inicializa o cliente Twilio dentro da função
        const twilioClient = new Twilio(
          twilioSid.value(),
          twilioToken.value(),
        );

        const messageBody = generateWhatsappMessage(formData, responseData);

        // Usando o número de Sandbox correto da Twilio como remetente.
        const twilioSandboxNumber = "+14155238886";
        console.log(`Enviando WhatsApp de ${twilioSandboxNumber} para ${target}...`);
        await twilioClient.messages.create({
          from: `whatsapp:${twilioSandboxNumber}`,
          to: `whatsapp:${target}`,
          body: messageBody,
        });
        console.log("Mensagem de WhatsApp enviada com sucesso!");
      }

      return null;
    } catch (error) {
      console.error("Erro ao processar a notificação:", error);
      return null;
    }
  });

// Collaborator Login Function with CORS
export const collaboratorLogin = onRequest(
  {
    cors: ["http://localhost:3000", "http://localhost", "https://your-production-domain.com"],
    minInstances: 1, // Keep at least 1 instance warm to avoid cold starts
  },
  async (req: Request, res: Response) => {
    console.log("collaboratorLogin called", { method: req.method, body: req.body });
    
    // Set CORS headers for all responses
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Handle preflight OPTIONS requests
    if (req.method === "OPTIONS") {
      console.log("Handling OPTIONS request");
      res.status(200).send();
      return;
    }

    if (req.method !== "POST") {
      console.log("Method not allowed:", req.method);
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { username, password } = req.body;
      console.log("Login attempt for username:", username);

      if (!username || !password) {
        console.log("Missing username or password");
        res.status(400).json({ error: "Username and password are required" });
        return;
      }

      // Query for collaborator in Firestore
      console.log("Starting collaborator search...");
      console.log("Request body:", req.body);
      
      try {
        // First, try to get user from Firebase Auth
        let userRecord;
        try {
          userRecord = await admin.auth().getUserByEmail(username);
          console.log("Firebase Auth user found for:", username);
          
          // For existing users, we need to verify password differently
          // In production, you'd use Firebase Client SDK for password verification
          // For now, we'll fall back to Firestore verification
          
        } catch (authError: any) {
          console.log("Firebase Auth failed, trying to create user:", authError.message);
          
          // If user doesn't exist in Firebase Auth, create them
          try {
            // Search for collaborator in Firestore first
            const collaboratorsRef = db.collection("departments");
            const allDepts = await collaboratorsRef.get();
            console.log("Departments query result:", allDepts.size, "departments found");
            
            let foundCollaborator = null;
            let foundDocId = null;
            let departmentId = null;
            
            for (const deptDoc of allDepts.docs) {
              const deptCollabs = await deptDoc.ref.collection('collaborators')
                .where("username", "==", username)
                .where("active", "==", true)
                .get();
                
              if (!deptCollabs.empty) {
                foundCollaborator = deptCollabs.docs[0].data();
                foundDocId = deptCollabs.docs[0].id;
                departmentId = deptDoc.id;
                break;
              }
            }
            
            if (!foundCollaborator) {
              console.log("No collaborator found for username:", username);
              res.status(401).json({ error: "Usuário ou senha incorretos" });
              return;
            }
            
            // Verify password from Firestore for now
            if (foundCollaborator.password !== password) {
              console.log("Password mismatch for username:", username);
              res.status(401).json({ error: "Usuário ou senha incorretos" });
              return;
            }
            
            // Create user in Firebase Auth with the same ID
            const email = foundCollaborator.email || `${username}@bravoform.com`;
            userRecord = await admin.auth().createUser({
              uid: foundDocId || undefined, // Use the same ID as Firestore
              email: email,
              emailVerified: false,
              password: password,
              displayName: foundCollaborator.name || username,
            });
            
            console.log("Created Firebase Auth user for:", username);
            
            // Update Firestore with Firebase Auth UID
            if (departmentId && foundDocId) {
              await db.collection('departments').doc(departmentId)
                .collection('collaborators').doc(foundDocId)
                .update({
                  firebaseUid: userRecord.uid,
                  email: email,
                  migratedToAuth: true,
                  migratedAt: new Date()
                });
            }
              
          } catch (createError: any) {
            console.error("Error creating Firebase Auth user:", createError);
            res.status(500).json({ error: "Erro ao criar usuário" });
            return;
          }
        }
        
        // Now get collaborator data from Firestore
        const collaboratorsRef = db.collection("departments");
        const allDepts = await collaboratorsRef.get();
        
        let foundCollaborator = null;
        let foundDocId = null;
        
        for (const deptDoc of allDepts.docs) {
          const deptCollabs = await deptDoc.ref.collection('collaborators')
            .where("username", "==", username)
            .where("active", "==", true)
            .get();
            
          if (!deptCollabs.empty) {
            foundCollaborator = deptCollabs.docs[0].data();
            foundDocId = deptCollabs.docs[0].id;
            break;
          }
        }
        
        if (!foundCollaborator) {
          console.log("No collaborator found for username:", username);
          res.status(401).json({ error: "Usuário ou senha incorretos" });
          return;
        }

        // For existing Firebase Auth users, verify password from Firestore
        // In production, you'd implement proper password verification
        if (!userRecord) {
          if (foundCollaborator.password !== password) {
            console.log("Password mismatch for username:", username);
            res.status(401).json({ error: "Usuário ou senha incorretos" });
            return;
          }
        }

        console.log("Login successful for username:", username);

        // Return session data
        const sessionData = {
          id: foundDocId,
          username: foundCollaborator.username,
          name: foundCollaborator.name,
          email: foundCollaborator.email,
          department: foundCollaborator.department,
          role: foundCollaborator.role || "collaborator",
          isTemporaryPassword: foundCollaborator.isTemporaryPassword || false,
          firebaseUid: userRecord?.uid,
          lastLogin: new Date().toISOString(),
        };

        console.log("Returning session data:", { username: sessionData.username, role: sessionData.role });
        res.status(200).json(sessionData);
        
      } catch (error: any) {
        console.error("Login error:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Create Collaborator Function - Creates user in Firebase Auth and document in root collaborators collection
export const createCollaborator = onRequest(
  {
    cors: ["http://localhost:3000", "http://localhost", "https://your-production-domain.com"],
  },
  async (req: Request, res: Response) => {
    console.log("createCollaborator called", { method: req.method, body: req.body });
    
    // Set CORS headers
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(200).send();
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const { 
        username, 
        email, 
        password, 
        name, 
        department, 
        role, 
        permissions,
        active = true 
      } = req.body;

      console.log("Creating collaborator:", { username, email, name, department });

      // Validate required fields
      if (!username || !email || !password || !name) {
        res.status(400).json({ error: "Username, email, password, and name are required" });
        return;
      }

      // Check if user already exists in Firebase Auth
      try {
        await admin.auth().getUserByEmail(email);
        res.status(409).json({ error: "User with this email already exists" });
        return;
      } catch (error) {
        // User doesn't exist, continue with creation
      }

      // Check if username already exists in Firestore
      const existingCollab = await db.collection('collaborators')
        .where('username', '==', username)
        .get();
      
      if (!existingCollab.empty) {
        res.status(409).json({ error: "Username already exists" });
        return;
      }

      // Create user in Firebase Auth
      const userRecord = await admin.auth().createUser({
        email: email,
        emailVerified: false,
        password: password,
        displayName: name,
        disabled: !active
      });

      console.log("Firebase Auth user created:", userRecord.uid);

      // Create collaborator document in root collection
      const collaboratorData = {
        uid: userRecord.uid,
        username: username,
        email: email,
        name: name,
        department: department || '',
        role: role || 'collaborator',
        active: active,
        permissions: permissions || {},
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLogin: null,
        // Add any specific permissions like canEditHistory
        canEditHistory: permissions?.canEditHistory || false,
        canDeleteForms: permissions?.canDeleteForms || false,
        canManageUsers: permissions?.canManageUsers || false,
        // Add any other metrics/permissions you need
      };

      await db.collection('collaborators').doc(userRecord.uid).set(collaboratorData);
      console.log("Collaborator document created in root collection");

      // Also create in department subcollection for UI compatibility
      const departmentCollabData = {
        id: userRecord.uid,
        username: username,
        name: name,
        email: email,
        canViewHistory: permissions?.canViewHistory || false,
        canEditHistory: permissions?.canEditHistory || false,
        isLeader: permissions?.isLeader || false,
      };

      // Find department by name to get its ID
      const departmentsSnapshot = await db.collection('departments')
        .where('name', '==', department)
        .get();
      
      if (!departmentsSnapshot.empty) {
        const departmentDoc = departmentsSnapshot.docs[0];
        await db.collection('departments')
          .doc(departmentDoc.id)
          .collection('collaborators')
          .doc(userRecord.uid)
          .set(departmentCollabData);
        
        console.log("Collaborator document also created in department subcollection");
      }

      // Return success response (without sensitive data)
      const response = {
        success: true,
        uid: userRecord.uid,
        username: username,
        email: email,
        name: name,
        department: department,
        role: role,
        active: active,
        permissions: collaboratorData.permissions
      };

      res.status(201).json(response);

    } catch (error: any) {
      console.error("Error creating collaborator:", error);
      res.status(500).json({ 
        error: "Failed to create collaborator",
        details: error.message 
      });
    }
  }
);
