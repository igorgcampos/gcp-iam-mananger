const axios = require('axios');
const { getAccessToken } = require('./gcpAuth');

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const BASE = `https://discoveryengine.googleapis.com/v1/projects/${PROJECT_ID}/locations/global`;

async function headers() {
  const token = await getAccessToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function listLicenseConfigs() {
  const h = await headers();
  const res = await axios.get(`${BASE}/licenseConfigs`, { headers: h });
  return res.data.licenseConfigs || [];
}

async function listUserLicenses() {
  const h = await headers();
  const res = await axios.get(
    `${BASE}/userStores/default_user_store/userLicenses`,
    { headers: h }
  );
  return res.data.userLicenses || [];
}

async function assignLicense(email, licenseConfigName) {
  const h = await headers();
  const res = await axios.post(
    `${BASE}/userStores/default_user_store:batchUpdateUserLicenses`,
    {
      inlineSource: {
        userLicenses: [{ userPrincipal: email, licenseConfig: licenseConfigName }],
      },
    },
    { headers: h }
  );
  return res.data;
}

async function removeLicense(email) {
  const h = await headers();
  const res = await axios.post(
    `${BASE}/userStores/default_user_store:batchUpdateUserLicenses`,
    {
      inlineSource: {
        userLicenses: [{ userPrincipal: email, licenseConfig: '' }],
      },
      deleteUnassignedUserLicenses: true,
    },
    { headers: h }
  );
  return res.data;
}

module.exports = { listLicenseConfigs, listUserLicenses, assignLicense, removeLicense };
