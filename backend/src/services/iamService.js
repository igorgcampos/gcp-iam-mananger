const { google } = require('googleapis');
const { auth } = require('./gcpAuth');

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const ROLE = 'roles/discoveryengine.user';
const WORKFORCE_PREFIX =
  'principal://iam.googleapis.com/locations/global/workforcePools/entra-workforce/subject/';

async function getPolicy() {
  const crm = google.cloudresourcemanager({ version: 'v1', auth });
  const res = await crm.projects.getIamPolicy({
    resource: PROJECT_ID,
    requestBody: {},
  });
  return res.data;
}

async function setPolicy(policy) {
  const crm = google.cloudresourcemanager({ version: 'v1', auth });
  await crm.projects.setIamPolicy({
    resource: PROJECT_ID,
    requestBody: { policy },
  });
}

async function listUsers() {
  const policy = await getPolicy();
  const binding = (policy.bindings || []).find((b) => b.role === ROLE);
  if (!binding) return [];

  return binding.members
    .filter((m) => m.startsWith('principal://'))
    .map((m) => ({
      email: m.split('/').pop(),
      principal: m,
    }));
}

async function addUser(email) {
  const policy = await getPolicy();
  const principal = `${WORKFORCE_PREFIX}${email}`;
  const bindings = policy.bindings || [];
  const binding = bindings.find((b) => b.role === ROLE);

  if (binding && binding.members.includes(principal)) {
    const err = new Error('Usuário já possui essa permissão');
    err.status = 409;
    throw err;
  }

  if (binding) {
    binding.members.push(principal);
  } else {
    bindings.push({ role: ROLE, members: [principal] });
    policy.bindings = bindings;
  }

  await setPolicy(policy);
  return { email, principal };
}

async function removeUser(email) {
  const policy = await getPolicy();
  const principal = `${WORKFORCE_PREFIX}${email}`;
  const bindings = policy.bindings || [];
  const binding = bindings.find((b) => b.role === ROLE);

  if (!binding) {
    const err = new Error('Role não encontrada na policy do projeto');
    err.status = 404;
    throw err;
  }

  const before = binding.members.length;
  binding.members = binding.members.filter((m) => m !== principal);

  if (binding.members.length === before) {
    const err = new Error('Usuário não encontrado com essa role');
    err.status = 404;
    throw err;
  }

  await setPolicy(policy);
}

module.exports = { listUsers, addUser, removeUser };
