const axios = require('axios');
const { getAccessToken } = require('./gcpAuth');
const iamService = require('./iamService');

const BASE = `https://discoveryengine.googleapis.com/v1/projects/${process.env.GCP_PROJECT_ID}/locations/global`;

const client = axios.create({ baseURL: BASE });
client.interceptors.request.use(async (config) => {
  config.headers.Authorization = `Bearer ${await getAccessToken()}`;
  return config;
});

async function listLicenseConfigs() {
  const res = await client.get('/licenseConfigs');
  return res.data.licenseConfigs || [];
}

async function listUserLicenses() {
  const res = await client.get('/userStores/default_user_store/userLicenses');
  return res.data.userLicenses || [];
}

async function assignLicense(email, licenseConfigName) {
  const res = await client.post('/userStores/default_user_store:batchUpdateUserLicenses', {
    inlineSource: {
      userLicenses: [{ userPrincipal: email, licenseConfig: licenseConfigName }],
    },
  });
  return res.data;
}

async function removeLicense(email) {
  const normalized = email.trim().toLowerCase();

  try {
    await iamService.removeUser(normalized);
  } catch (err) {
    if (err.status === 404) {
      console.log(`[gemini] usuário ${normalized} não tinha papel IAM para revogar`);
    } else {
      const wrapped = new Error('Falha ao revogar acesso IAM; licença não foi removida.');
      wrapped.status = 502;
      throw wrapped;
    }
  }

  const res = await client.post('/userStores/default_user_store:batchUpdateUserLicenses', {
    inlineSource: {
      userLicenses: [{ userPrincipal: normalized, licenseConfig: '' }],
    },
    deleteUnassignedUserLicenses: true,
  });
  console.log(`[gemini] licença e acesso IAM removidos para ${normalized}`);
  return res.data;
}

module.exports = { listLicenseConfigs, listUserLicenses, assignLicense, removeLicense };
