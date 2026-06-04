# Regras de Segurança — Agora Bot 2

## Segredos

Nunca commitar:

- tokens Meta
- tokens Z-API
- `GROQ_API_KEY`
- `JWT_SECRET`
- `INTERNAL_API_TOKEN`
- `ENCRYPTION_KEY`

## Criptografia

`accessToken` e `clientToken` são recebidos por API e gravados como:

- `accessTokenEncrypted`
- `clientTokenEncrypted`

Quando `ENCRYPTION_KEY` tem tamanho suficiente, usa AES-256-GCM.

## Autenticação interna

APIs `/api/v1/*` exigem:

- JWT válido, ou
- `x-api-key` igual a `INTERNAL_API_TOKEN`.

## Multiempresa

Nunca consultar dados operacionais sem `organizationId`.

## Logs

Não registrar tokens, secrets, senhas ou chaves. O logger mascara campos sensíveis por nome.
