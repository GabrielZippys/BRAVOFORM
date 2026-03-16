# 📧📱 Configuração de Notificações - Email e WhatsApp

Este guia mostra como configurar o envio REAL de notificações usando **Resend (Email)** e **Twilio (WhatsApp)** com o número da sua empresa.

---

## 📧 **1. CONFIGURAR EMAIL (Resend)**

### **Passo 1: Criar conta no Resend**
1. Acesse: https://resend.com/signup
2. Crie sua conta (grátis)
3. Confirme seu email

### **Passo 2: Obter API Key**
1. No dashboard do Resend, vá em **API Keys**
2. Clique em **Create API Key**
3. Copie a chave (começa com `re_...`)

### **Passo 3: Adicionar domínio (Opcional mas Recomendado)**
1. Vá em **Domains** no Resend
2. Adicione seu domínio (ex: `bravoform.com.br`)
3. Configure os registros DNS conforme instruções
4. Aguarde verificação (alguns minutos)

**Sem domínio próprio:** Pode usar `onboarding@resend.dev` (limitado)
**Com domínio:** Use `noreply@seudominio.com.br` (profissional)

---

## 📱 **2. CONFIGURAR WHATSAPP (Twilio)**

### **Opção A: Sandbox (Teste Rápido - 5 minutos)**

1. **Criar conta Twilio:**
   - Acesse: https://www.twilio.com/try-twilio
   - Crie conta grátis
   - Confirme telefone

2. **Ativar WhatsApp Sandbox:**
   - No console Twilio, vá em **Messaging** > **Try it out** > **Send a WhatsApp message**
   - Você verá um número tipo: `+1 415 523 8886`
   - Envie mensagem do seu WhatsApp para esse número com o código mostrado
   - Exemplo: `join <código>`

3. **Obter credenciais:**
   - **Account SID:** No dashboard principal
   - **Auth Token:** No dashboard (clique em "Show")
   - **WhatsApp From:** O número do sandbox (ex: `whatsapp:+14155238886`)

**Limitação:** Só envia para números que enviaram o código "join"

---

### **Opção B: WhatsApp Business API (Produção - SEU NÚMERO)**

1. **Criar conta Twilio** (mesmo processo acima)

2. **Solicitar acesso ao WhatsApp Business:**
   - No console Twilio, vá em **Messaging** > **WhatsApp** > **Senders**
   - Clique em **Request Access**
   - Preencha informações da empresa
   - Escolha **"I have a WhatsApp Business number"**

3. **Conectar seu número:**
   - Digite o número WhatsApp Business da empresa
   - Siga processo de verificação
   - Aguarde aprovação do WhatsApp (1-3 dias úteis)

4. **Após aprovação:**
   - Seu número estará ativo no Twilio
   - Use como `whatsapp:+5511999999999` (seu número)

**Custo:** ~$0.005 por mensagem (muito barato)
**Vantagem:** Mensagens saem do SEU número da empresa!

---

## 🔐 **3. CONFIGURAR VARIÁVEIS DE AMBIENTE**

### **No desenvolvimento local (.env.local):**

Crie o arquivo `.env.local` na raiz do projeto:

```env
# Resend (Email)
RESEND_API_KEY=re_sua_chave_aqui
RESEND_FROM_EMAIL=noreply@seudominio.com.br

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=seu_auth_token_aqui
TWILIO_WHATSAPP_FROM=whatsapp:+5511999999999
```

### **No Vercel (Produção):**

1. Acesse seu projeto no Vercel
2. Vá em **Settings** > **Environment Variables**
3. Adicione cada variável:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM`

4. Clique em **Save**
5. Faça um novo deploy (ou aguarde próximo deploy automático)

---

## ✅ **4. TESTAR AS NOTIFICAÇÕES**

### **Teste Local:**

1. Certifique-se que `.env.local` está configurado
2. Reinicie o servidor: `npm run dev`
3. Vá em um workflow > Editar etapa tipo "Notificação"
4. Configure email e/ou WhatsApp
5. Clique em **"Enviar Teste"**
6. Verifique se recebeu!

### **Teste em Produção (Vercel):**

1. Faça deploy no Vercel
2. Acesse a URL de produção
3. Teste da mesma forma
4. Verifique recebimento

---

## 📊 **5. MONITORAMENTO**

### **Resend:**
- Dashboard: https://resend.com/emails
- Veja todos os emails enviados
- Status de entrega
- Logs de erros

### **Twilio:**
- Console: https://console.twilio.com
- **Messaging** > **Logs**
- Veja todas as mensagens WhatsApp
- Status de entrega
- Custos

---

## 💰 **6. CUSTOS**

### **Resend (Email):**
- **Grátis:** 100 emails/dia
- **Pro:** $20/mês = 50.000 emails
- **Mais:** Planos maiores disponíveis

### **Twilio (WhatsApp):**
- **Sandbox:** Grátis (limitado)
- **Produção:** ~$0.005 por mensagem
- **Exemplo:** 1000 mensagens/mês = ~$5

**Total estimado:** $25-30/mês para uso moderado

---

## 🚨 **7. TROUBLESHOOTING**

### **Email não chega:**
- ✅ Verifique RESEND_API_KEY está correta
- ✅ Confirme email do destinatário
- ✅ Verifique spam/lixeira
- ✅ Veja logs no dashboard Resend

### **WhatsApp não chega:**
- ✅ Verifique TWILIO_ACCOUNT_SID e AUTH_TOKEN
- ✅ Confirme formato do número: `+5511999999999`
- ✅ No sandbox: destinatário enviou "join"?
- ✅ Veja logs no console Twilio

### **Erro 500 na API:**
- ✅ Variáveis de ambiente configuradas?
- ✅ Dependências instaladas? (`npm install`)
- ✅ Veja logs do Vercel/console

---

## 📝 **8. PRÓXIMOS PASSOS**

1. ✅ Instalar dependências: `npm install resend twilio`
2. ✅ Criar conta Resend e Twilio
3. ✅ Configurar `.env.local`
4. ✅ Testar localmente
5. ✅ Configurar variáveis no Vercel
6. ✅ Deploy e testar em produção
7. ✅ (Opcional) Migrar de sandbox para WhatsApp Business API

---

## 🎯 **RESUMO RÁPIDO**

**Para começar AGORA (5 minutos):**
1. Crie conta Resend → Copie API Key
2. Crie conta Twilio → Ative Sandbox WhatsApp
3. Configure `.env.local` com as credenciais
4. Reinicie servidor e teste!

**Para produção (seu número):**
1. Solicite WhatsApp Business API no Twilio
2. Conecte número da empresa
3. Aguarde aprovação (1-3 dias)
4. Atualize `TWILIO_WHATSAPP_FROM` com seu número

---

## 📞 **SUPORTE**

- **Resend:** https://resend.com/docs
- **Twilio:** https://www.twilio.com/docs/whatsapp
- **Dúvidas:** Consulte a documentação oficial

---

**Pronto! Agora você tem notificações profissionais funcionando! 🚀**
