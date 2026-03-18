# Firebase Functions - BRAVOFORM

## 🔥 Triggers de Workflow Automáticos

Este diretório contém as Firebase Functions que automatizam o sistema de workflow do BRAVOFORM.

### **Triggers Implementados**

#### 1. **onWorkflowInstanceCreated**
- **Evento:** Quando uma nova instância de workflow é criada
- **Ação:** Notifica o colaborador atribuído via Email e WhatsApp
- **Mensagem:** "🔔 Novo workflow atribuído!"

#### 2. **onWorkflowInstanceUpdated**
- **Evento:** Quando uma instância é atualizada
- **Detecta:**
  - Mudança de etapa → Notifica "⏰ É sua vez!"
  - Workflow concluído → Notifica "✅ Workflow concluído!"
  - Workflow rejeitado → Notifica "❌ Etapa rejeitada"

---

## 📦 Deploy

### **1. Instalar Firebase CLI**
```bash
npm install -g firebase-tools
```

### **2. Login no Firebase**
```bash
firebase login
```

### **3. Configurar Variáveis de Ambiente**
```bash
firebase functions:config:set nodemailer.user="seu-email@gmail.com"
firebase functions:config:set nodemailer.pass="sua-senha-app"
```

### **4. Deploy das Functions**
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

---

## ⚙️ Configuração

### **Variáveis de Ambiente Necessárias:**

- `NODEMAILER_USER` - Email para envio (ex: noreply@bravoform.com)
- `NODEMAILER_PASS` - Senha de app do Gmail

### **Configuração do Twilio:**

As credenciais do Twilio são carregadas automaticamente do Firestore:
- Collection: `integrations`
- Document ID: `{userId}` (criador do workflow)
- Campos: `twilio.accountSid`, `twilio.authToken`, `twilio.whatsappFrom`

---

## 📁 Estrutura

```
functions/
├── src/
│   ├── index.ts              # Exporta todas as functions
│   └── workflowTriggers.ts   # Triggers de workflow
├── package.json
└── tsconfig.json
```

---

## 🧪 Testes Locais

### **Emulador Firebase:**
```bash
firebase emulators:start
```

### **Testar Triggers:**
1. Crie uma instância de workflow no Firestore
2. Verifique os logs do emulador
3. Confirme envio de notificações

---

## 📊 Logs e Monitoramento

### **Ver logs em produção:**
```bash
firebase functions:log
```

### **Logs específicos:**
```bash
firebase functions:log --only onWorkflowInstanceCreated
```

---

## 🔒 Segurança

- Credenciais armazenadas em Firebase Config
- Validação de dados antes de enviar notificações
- Tratamento de erros completo
- Logs detalhados para debugging

---

## 🚀 Próximos Passos

- [ ] Implementar retry automático em caso de falha
- [ ] Adicionar rate limiting para evitar spam
- [ ] Criar dashboard de monitoramento de notificações
- [ ] Implementar notificações in-app (Firebase Cloud Messaging)
