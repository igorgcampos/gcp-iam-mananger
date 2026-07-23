const { crm } = require('./gcpClients');

const PROJECT_ID = process.env.GCP_PROJECT_ID;

async function getPolicy() {
  const res = await crm.projects.getIamPolicy({
    resource: PROJECT_ID,
    requestBody: { options: { requestedPolicyVersion: 3 } },
  });
  return res.data;
}

async function setPolicy(policy) {
  policy.version = 3;
  const res = await crm.projects.setIamPolicy({
    resource: PROJECT_ID,
    requestBody: { policy },
  });
  return res.data;
}

module.exports = { getPolicy, setPolicy };
