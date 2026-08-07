require('dotenv').config();
const { resolveAppSecrets } = require('./services/secretManager');

async function main() {
  try {
    await resolveAppSecrets();
  } catch (err) {
    // Falha rápido: sem os dois segredos resolvidos, /auth/login nunca
    // funcionaria — melhor não subir do que subir "quebrado" (ver
    // docs/adr/0007-adc-e-secret-manager-para-credenciais.md).
    console.error('Falha ao resolver segredos no boot:', err.message);
    process.exit(1);
  }

  // Só exige app.js (e, por consequência, msalClient.js/sessionToken.js)
  // depois dos segredos resolvidos.
  // eslint-disable-next-line global-require
  const app = require('./app');
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
  });
}

main();
