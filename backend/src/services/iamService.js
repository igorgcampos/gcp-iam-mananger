const { getPolicy, setPolicy } = require('./iamPolicyStore');
const { validateAndCleanup } = require('./principalProbe');

const ROLE = 'roles/discoveryengine.user';
const WORKFORCE_PREFIX =
  'principal://iam.googleapis.com/locations/global/workforcePools/entra-workforce/subject/';

async function listUsers() {
  const policy = await getPolicy();
  const binding = (policy.bindings || []).find((b) => b.role === ROLE);
  if (!binding) return [];

  return (binding.members || [])
    .filter((m) => m.startsWith('principal://'))
    .map((m) => ({
      email: m.split('/').pop(),
      principal: m,
    }));
}

async function addUser(email) {
  const policy = await getPolicy();
  const principal = `${WORKFORCE_PREFIX}${email}`;
  policy.bindings ??= [];
  const binding = policy.bindings.find((b) => b.role === ROLE);

  if (binding && binding.members.includes(principal)) {
    const err = new Error('Usuário já possui essa permissão');
    err.status = 409;
    throw err;
  }

  const cleanPolicy = await validateAndCleanup(policy, email);
  cleanPolicy.bindings ??= [];
  const cleanBinding = cleanPolicy.bindings.find((b) => b.role === ROLE);

  if (cleanBinding) {
    cleanBinding.members.push(principal);
  } else {
    cleanPolicy.bindings.push({ role: ROLE, members: [principal] });
  }

  await setPolicy(cleanPolicy);
  return { email, principal };
}

async function removeUser(email) {
  const policy = await getPolicy();
  const principal = `${WORKFORCE_PREFIX}${email}`;
  policy.bindings ??= [];
  const binding = policy.bindings.find((b) => b.role === ROLE);

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
