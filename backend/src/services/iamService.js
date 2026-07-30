const { getPolicy, setPolicy } = require('./iamPolicyStore');
const { validateAndCleanup } = require('./principalProbe');

const ROLE = 'roles/discoveryengine.user';
const WORKFORCE_PREFIX =
  'principal://iam.googleapis.com/locations/global/workforcePools/entra-workforce/subject/';
const CODE_ASSIST_ROLE = `projects/${process.env.GCP_PROJECT_ID}/roles/CustomRole`;
const CODE_ASSIST_MEMBER_PREFIX = 'user:';

async function listUsers() {
  const policy = await getPolicy();
  const binding = (policy.bindings || []).find((b) => b.role === ROLE);
  if (!binding) return [];

  const codeAssistBinding = (policy.bindings || []).find((b) => b.role === CODE_ASSIST_ROLE);
  const codeAssistEmails = new Set(
    (codeAssistBinding?.members || [])
      .filter((m) => m.startsWith(CODE_ASSIST_MEMBER_PREFIX))
      .map((m) => m.slice(CODE_ASSIST_MEMBER_PREFIX.length))
  );

  return (binding.members || [])
    .filter((m) => m.startsWith('principal://'))
    .map((m) => {
      const email = m.split('/').pop();
      return { email, principal: m, codeAssist: codeAssistEmails.has(email) };
    });
}

async function addUser(email, { codeAssist = false } = {}) {
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
  const result = { email, principal };

  if (codeAssist) {
    try {
      await addCodeAssistUser(email);
      result.codeAssist = { granted: true };
    } catch (err) {
      result.codeAssist = { granted: false, error: err.message };
    }
  }

  return result;
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

async function addCodeAssistUser(email) {
  const policy = await getPolicy();
  const principal = `${WORKFORCE_PREFIX}${email}`;
  const mainBinding = (policy.bindings || []).find((b) => b.role === ROLE);

  if (!mainBinding || !mainBinding.members.includes(principal)) {
    const err = new Error('Usuário precisa ter discoveryengine.user antes de receber o Code Assist');
    err.status = 404;
    throw err;
  }

  const member = `${CODE_ASSIST_MEMBER_PREFIX}${email}`;
  policy.bindings ??= [];
  const binding = policy.bindings.find((b) => b.role === CODE_ASSIST_ROLE);

  if (binding && binding.members.includes(member)) {
    const err = new Error('Usuário já possui essa permissão');
    err.status = 409;
    throw err;
  }

  const cleanPolicy = await validateAndCleanup(policy, email);
  cleanPolicy.bindings ??= [];
  const cleanBinding = cleanPolicy.bindings.find((b) => b.role === CODE_ASSIST_ROLE);

  if (cleanBinding) {
    cleanBinding.members.push(member);
  } else {
    cleanPolicy.bindings.push({ role: CODE_ASSIST_ROLE, members: [member] });
  }

  await setPolicy(cleanPolicy);
  return { email, member };
}

async function removeCodeAssistUser(email) {
  const policy = await getPolicy();
  const member = `${CODE_ASSIST_MEMBER_PREFIX}${email}`;
  policy.bindings ??= [];
  const binding = policy.bindings.find((b) => b.role === CODE_ASSIST_ROLE);

  if (!binding) {
    const err = new Error('Role não encontrada na policy do projeto');
    err.status = 404;
    throw err;
  }

  const before = binding.members.length;
  binding.members = binding.members.filter((m) => m !== member);

  if (binding.members.length === before) {
    const err = new Error('Usuário não encontrado com essa role');
    err.status = 404;
    throw err;
  }

  await setPolicy(policy);
}

module.exports = { listUsers, addUser, removeUser, addCodeAssistUser, removeCodeAssistUser };
