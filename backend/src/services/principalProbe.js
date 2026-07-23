const { iam } = require('./gcpClients');
const { setPolicy } = require('./iamPolicyStore');

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const PROBE_ROLE_ID = 'iamValidationProbe';
const PROBE_ROLE_NAME = `projects/${PROJECT_ID}/roles/${PROBE_ROLE_ID}`;
const PROBE_TTL_MS = 5 * 60 * 1000;
const NOT_FOUND_RE = /does not exist/i;

async function ensureProbeRole() {
  try {
    await iam.projects.roles.get({ name: PROBE_ROLE_NAME });
  } catch (err) {
    if (err.code !== 404) throw err;

    await iam.projects.roles.create({
      parent: `projects/${PROJECT_ID}`,
      requestBody: {
        roleId: PROBE_ROLE_ID,
        role: {
          title: 'IAM Validation Probe',
          description:
            'Role descartável usada apenas para validar se um principal existe antes de conceder acesso real. Sem poder real.',
          includedPermissions: ['resourcemanager.projects.get'],
          stage: 'GA',
        },
      },
    });
  }
}

function buildProbeBinding(email) {
  const expireTime = new Date(Date.now() + PROBE_TTL_MS).toISOString();
  return {
    role: PROBE_ROLE_NAME,
    members: [`user:${email}`],
    condition: {
      title: 'iam-validation-probe-expiry',
      description: 'Probe descartável de validação de principal — expira automaticamente',
      expression: `request.time < timestamp("${expireTime}")`,
    },
  };
}

function isPrincipalNotFoundError(err) {
  const message = err.response?.data?.error?.message ?? err.message ?? '';
  return NOT_FOUND_RE.test(message);
}

function removeProbeBinding(policy, email) {
  const cleaned = { ...policy };
  cleaned.bindings = (policy.bindings || [])
    .map((b) =>
      b.role === PROBE_ROLE_NAME
        ? { ...b, members: b.members.filter((m) => m !== `user:${email}`) }
        : b
    )
    .filter((b) => b.role !== PROBE_ROLE_NAME || b.members.length > 0);
  return cleaned;
}

async function validateAndCleanup(policy, email) {
  await ensureProbeRole();

  const probeAttempt = { ...policy, bindings: [...(policy.bindings || []), buildProbeBinding(email)] };

  let resultPolicy;
  try {
    resultPolicy = await setPolicy(probeAttempt);
  } catch (err) {
    if (isPrincipalNotFoundError(err)) {
      const notSynced = new Error(
        'Usuário não sincronizado. Solicite ao time de AD a inclusão desse email no grupo de sincronização.'
      );
      notSynced.status = 422;
      throw notSynced;
    }

    const generic = new Error('Falha ao validar usuário. Tente novamente.');
    generic.status = 500;
    throw generic;
  }

  return removeProbeBinding(resultPolicy, email);
}

module.exports = { ensureProbeRole, validateAndCleanup, PROBE_ROLE_NAME };
