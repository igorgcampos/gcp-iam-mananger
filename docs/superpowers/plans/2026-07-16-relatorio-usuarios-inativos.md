# Relatório de Usuários Inativos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand "Relatório de Inatividade" button to the existing Gemini Enterprise page that opens a modal listing users whose license is idle (never used, or unused past a chosen number of months), with a per-row action to remove that license.

**Architecture:** All new logic is pure-JS/React on the frontend — no backend changes. A new pure module (`inactivity.js`) computes the reference date and inactivity filter/sort; a new component (`InactivityReportModal.jsx`) renders the button + modal + table using that module and the already-fetched `users`/`configs` state from `GeminiPage.jsx`. Shared license-formatting helpers currently duplicated inline in `GeminiPage.jsx` are extracted to `licenseFormatting.jsx` so both the existing table and the new modal render tags identically.

**Tech Stack:** React 18, Vite, Ant Design v5, Vitest + @testing-library/react (new, introduced in Task 1) for the frontend. No backend or new dependencies there.

## Global Constraints

- No new backend endpoints, no scheduler, no email, no CSV export, no persistence — this feature is 100% client-side, computed from data already fetched by `GET /api/gemini/users`.
- Default inactivity threshold is **2 months**; the user picks from `1, 2, 3, 6, 12` months in a `Select` inside the modal.
- Only assignments with `licenseAssignmentState === 'ASSIGNED'` count as inactive candidates.
- Reference date for inactivity = `lastLoginTime`, falling back to `createTime` when the user has never logged in.
- Modal table columns: Email, Licença, Status, Atribuída em, Último acesso, Tempo inativo, Ações — sorted by Tempo inativo descending (most inactive first).
- Remove action in the modal reuses the same `removeGeminiUser` flow (via a passed-in `onRemove` callback) already used by the main table, including the `Popconfirm` confirmation step.
- All new UI copy is in Portuguese, matching the existing page.

---

### Task 1: Introduce Vitest + React Testing Library into the frontend

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.js`
- Create: `frontend/src/test/setup.js`
- Test: `frontend/src/test/sanity.test.js`

**Interfaces:**
- Consumes: nothing (infra-only task).
- Produces: `npm test` (in `frontend/`) runs Vitest in `jsdom` mode with `@testing-library/jest-dom` matchers globally available. All later tasks' test files rely on this working.

- [ ] **Step 1: Install the test dependencies**

Run:
```bash
cd frontend
npm install --save-dev vitest@^4.1.10 @testing-library/react@^16.3.2 @testing-library/jest-dom@^6.9.1 @testing-library/user-event@^14.6.1 jsdom@^29.1.1
```
Expected: `frontend/package.json` gains these 5 packages under `devDependencies`, and `frontend/package-lock.json` updates.

- [ ] **Step 2: Add the `test` script**

Edit `frontend/package.json` — add a `"test"` entry to `"scripts"` so the final block reads:

```json
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create the Vitest config, merged with the existing Vite config**

Create `frontend/vitest.config.js`:

```js
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      globals: true,
    },
  })
);
```

- [ ] **Step 4: Create the test setup file**

Create `frontend/src/test/setup.js`:

```js
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 5: Write a sanity test to prove the config works**

Create `frontend/src/test/sanity.test.js`:

```js
import { describe, expect, it } from 'vitest';

describe('vitest setup', () => {
  it('runs in a jsdom environment', () => {
    expect(typeof document).toBe('object');
    expect(document.createElement('div')).toBeInstanceOf(HTMLElement);
  });
});
```

- [ ] **Step 6: Run the test and verify it passes**

Run: `cd frontend && npm test`
Expected: `sanity.test.js` passes (1 test, 1 passed). If Vitest complains about the config file being ambiguous between `vite.config.js` and `vitest.config.js`, confirm the version installed matches `^4.1.10` — this version reads `vitest.config.js` in preference to `vite.config.js` automatically.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.js frontend/src/test/setup.js frontend/src/test/sanity.test.js
git commit -m "test: introduce Vitest and React Testing Library to frontend"
```

---

### Task 2: Extract shared license-formatting helpers

**Files:**
- Create: `frontend/src/utils/licenseFormatting.jsx`
- Test: `frontend/src/utils/licenseFormatting.test.jsx`
- Modify: `frontend/src/pages/GeminiPage.jsx:1-44`, `frontend/src/pages/GeminiPage.jsx:112-137`

**Interfaces:**
- Consumes: nothing new (pure refactor of existing inline code in `GeminiPage.jsx`).
- Produces: `tierName(tier: string): string`, `tierColor(name?: string): string`, `stateTag(state: string): JSX.Element`, `renderLicenseTag(licenseConfigName: string, configs: Array<{name: string, subscriptionTier: string}>): JSX.Element | string` — Task 4's `InactivityReportModal.jsx` imports all four from this module.

- [ ] **Step 1: Write the failing tests for the extracted module**

Create `frontend/src/utils/licenseFormatting.test.jsx`:

```jsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { tierName, tierColor, stateTag, renderLicenseTag } from './licenseFormatting';

describe('tierName', () => {
  it('maps known tier keys to friendly names', () => {
    expect(tierName('SUBSCRIPTION_TIER_ENTERPRISE')).toBe('Gemini Enterprise Standard');
    expect(tierName('SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT')).toBe('Agentspace Enterprise Plus');
  });

  it('falls back to the raw tier when unknown, or "Licença" when falsy', () => {
    expect(tierName('SOME_OTHER_TIER')).toBe('SOME_OTHER_TIER');
    expect(tierName(undefined)).toBe('Licença');
  });
});

describe('tierColor', () => {
  it('colors Plus tiers purple, Standard tiers blue, and anything else default', () => {
    expect(tierColor('Agentspace Enterprise Plus')).toBe('purple');
    expect(tierColor('Gemini Enterprise Standard')).toBe('blue');
    expect(tierColor('Something Else')).toBe('default');
  });
});

describe('stateTag', () => {
  it('renders "Atribuída" for ASSIGNED', () => {
    render(stateTag('ASSIGNED'));
    expect(screen.getByText('Atribuída')).toBeInTheDocument();
  });

  it('renders "Sem licença" for NO_LICENSE_ATTEMPTED_LOGIN', () => {
    render(stateTag('NO_LICENSE_ATTEMPTED_LOGIN'));
    expect(screen.getByText('Sem licença')).toBeInTheDocument();
  });

  it('renders the raw state for anything else', () => {
    render(stateTag('SOME_OTHER_STATE'));
    expect(screen.getByText('SOME_OTHER_STATE')).toBeInTheDocument();
  });
});

describe('renderLicenseTag', () => {
  const configs = [
    { name: 'configs/a', subscriptionTier: 'SUBSCRIPTION_TIER_ENTERPRISE' },
  ];

  it('renders the friendly tier name when the config is found', () => {
    render(renderLicenseTag('configs/a', configs));
    expect(screen.getByText('Gemini Enterprise Standard')).toBeInTheDocument();
  });

  it('renders an em dash when the config is not found', () => {
    const { container } = render(<>{renderLicenseTag('configs/missing', configs)}</>);
    expect(container.textContent).toBe('—');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- licenseFormatting`
Expected: FAIL — `Failed to resolve import "./licenseFormatting"` (module does not exist yet).

- [ ] **Step 3: Create the extracted module**

Create `frontend/src/utils/licenseFormatting.jsx`:

```jsx
import React from 'react';
import { Tag } from 'antd';

export const TIER_NAMES = {
  SUBSCRIPTION_TIER_ENTERPRISE: 'Gemini Enterprise Standard',
  SUBSCRIPTION_TIER_SEARCH_AND_ASSISTANT: 'Agentspace Enterprise Plus',
};

export function tierName(tier) {
  return TIER_NAMES[tier] || tier || 'Licença';
}

export function tierColor(name = '') {
  if (name.includes('Plus')) return 'purple';
  if (name.includes('Standard')) return 'blue';
  return 'default';
}

export function stateTag(state) {
  if (state === 'ASSIGNED') return <Tag color="green">Atribuída</Tag>;
  if (state === 'NO_LICENSE_ATTEMPTED_LOGIN') return <Tag color="orange">Sem licença</Tag>;
  return <Tag>{state}</Tag>;
}

export function resolveTierName(licenseConfigName, configs) {
  const config = configs.find((c) => c.name === licenseConfigName);
  return config ? tierName(config.subscriptionTier) : null;
}

export function renderLicenseTag(licenseConfigName, configs) {
  const label = resolveTierName(licenseConfigName, configs);
  return label ? <Tag color={tierColor(label)}>{label}</Tag> : '—';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- licenseFormatting`
Expected: PASS (7 tests).

- [ ] **Step 5: Update `GeminiPage.jsx` to use the extracted module instead of its local copies**

In `frontend/src/pages/GeminiPage.jsx`, replace the import block and the now-duplicated local declarations.

Replace lines 1-27 (from `import React...` through the end of the `tierColor` function) with:

```jsx
import React, { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Modal, Form, Input, Select, Popconfirm,
  Typography, Space, Tag, message, Card, Row, Col, Statistic, Divider, Tooltip, Badge,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, RobotOutlined, SearchOutlined,
} from '@ant-design/icons';
import { listLicenseConfigs, listGeminiUsers, addGeminiUser, removeGeminiUser } from '../api/gemini';
import { tierName, tierColor, stateTag, renderLicenseTag } from '../utils/licenseFormatting';

const { Title, Text } = Typography;
const POLL_INTERVAL = 30_000;

function formatDate(d) {
  if (!d || !d.year) return null;
  return `${String(d.day).padStart(2, '0')}/${String(d.month).padStart(2, '0')}/${d.year}`;
}

function assignedCount(config, users) {
  return users.filter(
    (u) => u.licenseConfig === config.name && u.licenseAssignmentState === 'ASSIGNED'
  ).length;
}
```

(This removes the local `TIER_NAMES`, `tierName`, `tierColor`, and `stateTag` definitions, keeping `formatDate` and `assignedCount` as-is since they aren't part of the extracted module — `formatDate` formats a Google date object for license-config renewal dates, unrelated to tier naming.)

Then, in the `columns` array, replace the `Licença` column's `render` (originally lines 116-120):

```jsx
      render: (v) => {
        const config = configs.find((c) => c.name === v);
        const label = config ? tierName(config.subscriptionTier) : '—';
        return v ? <Tag color={tierColor(label)}>{label}</Tag> : '—';
      },
```

with:

```jsx
      render: (v) => renderLicenseTag(v, configs),
```

And replace the `Status` column's `render` (originally line 131):

```jsx
      render: (v) => stateTag(v),
```

stays exactly as written — it now resolves to the imported `stateTag` instead of the local one, so no change needed there beyond the import at the top already added.

- [ ] **Step 6: Manually verify the main page still renders correctly**

Run: `npm run dev` (from the project root, per the root `package.json`, or `cd frontend && npm run dev` for frontend-only).
Open the Gemini Enterprise page in the browser and confirm:
- The Licença column still shows colored tags with the correct tier names.
- The Status column still shows "Atribuída" / "Sem licença" tags.
- The license-count cards (`Card`/`Statistic` at the top) still show correct tier names/colors.

Expected: visually identical to before this task — this is a pure refactor, no behavior change.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/utils/licenseFormatting.jsx frontend/src/utils/licenseFormatting.test.jsx frontend/src/pages/GeminiPage.jsx
git commit -m "refactor: extract license-formatting helpers into a shared module"
```

---

### Task 3: Build the pure inactivity-calculation module

**Files:**
- Create: `frontend/src/utils/inactivity.js`
- Test: `frontend/src/utils/inactivity.test.js`

**Interfaces:**
- Consumes: nothing (pure functions over plain objects shaped like the `userLicenses` records already returned by `GET /api/gemini/users`: `{ userPrincipal, licenseConfig, licenseAssignmentState, createTime, lastLoginTime }`).
- Produces: `DEFAULT_INACTIVITY_MONTHS: number`, `INACTIVITY_MONTH_OPTIONS: number[]`, `getReferenceDate(user): Date | null`, `monthsBetween(pastDate: Date, now: Date): number`, `isInactiveUser(user, thresholdMonths: number, now?: Date): boolean`, `buildInactivityReport(users, thresholdMonths: number, now?: Date): Array<user & { monthsInactive: number }>` (sorted descending by `monthsInactive`), `formatMonthsInactive(months: number): string` — all consumed by Task 4's `InactivityReportModal.jsx`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/inactivity.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INACTIVITY_MONTHS,
  INACTIVITY_MONTH_OPTIONS,
  getReferenceDate,
  monthsBetween,
  isInactiveUser,
  buildInactivityReport,
  formatMonthsInactive,
} from './inactivity';

describe('constants', () => {
  it('defaults to 2 months and offers 1/2/3/6/12 as options', () => {
    expect(DEFAULT_INACTIVITY_MONTHS).toBe(2);
    expect(INACTIVITY_MONTH_OPTIONS).toEqual([1, 2, 3, 6, 12]);
  });
});

describe('getReferenceDate', () => {
  it('uses lastLoginTime when present', () => {
    const user = { lastLoginTime: '2025-10-01T00:00:00Z', createTime: '2025-01-01T00:00:00Z' };
    expect(getReferenceDate(user)).toEqual(new Date('2025-10-01T00:00:00Z'));
  });

  it('falls back to createTime when lastLoginTime is absent (never logged in)', () => {
    const user = { lastLoginTime: null, createTime: '2026-06-08T00:00:00Z' };
    expect(getReferenceDate(user)).toEqual(new Date('2026-06-08T00:00:00Z'));
  });

  it('returns null when neither date is present', () => {
    expect(getReferenceDate({})).toBeNull();
  });
});

describe('monthsBetween', () => {
  it('counts whole elapsed months, flooring partial months', () => {
    const now = new Date('2026-07-16T00:00:00');
    expect(monthsBetween(new Date('2025-10-01T00:00:00'), now)).toBe(9);
    expect(monthsBetween(new Date('2026-06-08T00:00:00'), now)).toBe(1);
    expect(monthsBetween(now, now)).toBe(0);
  });

  it('does not count a month as elapsed until the day-of-month is reached', () => {
    expect(monthsBetween(new Date('2025-01-31T00:00:00'), new Date('2025-03-01T00:00:00'))).toBe(1);
  });
});

describe('isInactiveUser', () => {
  const now = new Date('2026-07-16T00:00:00');

  it('is true for an ASSIGNED user whose reference date is past the threshold', () => {
    const user = {
      licenseAssignmentState: 'ASSIGNED',
      createTime: '2025-10-01T00:00:00',
      lastLoginTime: '2025-10-01T00:00:00',
    };
    expect(isInactiveUser(user, 2, now)).toBe(true);
  });

  it('is false for an ASSIGNED user within the threshold', () => {
    const user = {
      licenseAssignmentState: 'ASSIGNED',
      createTime: '2026-06-08T00:00:00',
      lastLoginTime: null,
    };
    expect(isInactiveUser(user, 2, now)).toBe(false);
  });

  it('is false regardless of dates when the license is not ASSIGNED', () => {
    const user = {
      licenseAssignmentState: 'NO_LICENSE_ATTEMPTED_LOGIN',
      createTime: '2020-01-01T00:00:00',
      lastLoginTime: null,
    };
    expect(isInactiveUser(user, 2, now)).toBe(false);
  });

  it('is false when there is no reference date at all', () => {
    const user = { licenseAssignmentState: 'ASSIGNED', createTime: null, lastLoginTime: null };
    expect(isInactiveUser(user, 2, now)).toBe(false);
  });
});

describe('buildInactivityReport', () => {
  const now = new Date('2026-07-16T00:00:00');
  const users = [
    { userPrincipal: 'caio.rosa@oglobo.com.br', licenseAssignmentState: 'ASSIGNED', createTime: '2026-06-08T00:00:00', lastLoginTime: null },
    { userPrincipal: 'luan.oliveira@oglobo.com.br', licenseAssignmentState: 'ASSIGNED', createTime: '2025-10-01T00:00:00', lastLoginTime: '2025-10-01T00:00:00' },
    { userPrincipal: 'ana.souza@oglobo.com.br', licenseAssignmentState: 'ASSIGNED', createTime: '2026-01-16T00:00:00', lastLoginTime: '2026-01-16T00:00:00' },
    { userPrincipal: 'sem.licenca@oglobo.com.br', licenseAssignmentState: 'NO_LICENSE_ATTEMPTED_LOGIN', createTime: '2020-01-01T00:00:00', lastLoginTime: null },
  ];

  it('excludes caio (only 1 month) and the non-ASSIGNED user, keeps and sorts the rest by months inactive descending', () => {
    const report = buildInactivityReport(users, 2, now);
    expect(report.map((u) => u.userPrincipal)).toEqual([
      'luan.oliveira@oglobo.com.br',
      'ana.souza@oglobo.com.br',
    ]);
    expect(report[0].monthsInactive).toBe(9);
    expect(report[1].monthsInactive).toBe(6);
  });

  it('returns an empty array when nobody crosses the threshold', () => {
    expect(buildInactivityReport(users, 12, now)).toEqual([]);
  });
});

describe('formatMonthsInactive', () => {
  it('uses singular "mês" for 1 and plural "meses" otherwise', () => {
    expect(formatMonthsInactive(1)).toBe('1 mês');
    expect(formatMonthsInactive(4)).toBe('4 meses');
    expect(formatMonthsInactive(0)).toBe('0 meses');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- inactivity`
Expected: FAIL — `Failed to resolve import "./inactivity"` (module does not exist yet).

- [ ] **Step 3: Implement the module**

Create `frontend/src/utils/inactivity.js`:

```js
export const DEFAULT_INACTIVITY_MONTHS = 2;

export const INACTIVITY_MONTH_OPTIONS = [1, 2, 3, 6, 12];

export function getReferenceDate(user) {
  const source = user.lastLoginTime || user.createTime;
  return source ? new Date(source) : null;
}

export function monthsBetween(pastDate, now) {
  let total = (now.getFullYear() - pastDate.getFullYear()) * 12 + (now.getMonth() - pastDate.getMonth());
  if (now.getDate() < pastDate.getDate()) total -= 1;
  return Math.max(total, 0);
}

export function isInactiveUser(user, thresholdMonths, now = new Date()) {
  if (user.licenseAssignmentState !== 'ASSIGNED') return false;
  const referenceDate = getReferenceDate(user);
  if (!referenceDate) return false;
  return monthsBetween(referenceDate, now) >= thresholdMonths;
}

export function buildInactivityReport(users, thresholdMonths, now = new Date()) {
  return users
    .filter((user) => isInactiveUser(user, thresholdMonths, now))
    .map((user) => ({ ...user, monthsInactive: monthsBetween(getReferenceDate(user), now) }))
    .sort((a, b) => b.monthsInactive - a.monthsInactive);
}

export function formatMonthsInactive(months) {
  return `${months} ${months === 1 ? 'mês' : 'meses'}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- inactivity`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/inactivity.js frontend/src/utils/inactivity.test.js
git commit -m "feat: add pure inactivity-calculation module"
```

---

### Task 4: Build the `InactivityReportModal` component

**Files:**
- Create: `frontend/src/components/InactivityReportModal.jsx`
- Test: `frontend/src/components/InactivityReportModal.test.jsx`

**Interfaces:**
- Consumes: `renderLicenseTag`, `stateTag` from `../utils/licenseFormatting` (Task 2); `DEFAULT_INACTIVITY_MONTHS`, `INACTIVITY_MONTH_OPTIONS`, `buildInactivityReport`, `formatMonthsInactive` from `../utils/inactivity` (Task 3).
- Produces: a default-exported React component with props `{ users: Array, configs: Array, onRemove: (userPrincipal: string) => void }`. Task 5 renders `<InactivityReportModal users={users} configs={configs} onRemove={handleRemove} />` inside `GeminiPage.jsx`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/InactivityReportModal.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InactivityReportModal from './InactivityReportModal';

const configs = [
  { name: 'configs/enterprise', subscriptionTier: 'SUBSCRIPTION_TIER_ENTERPRISE' },
];

const users = [
  {
    userPrincipal: 'caio.rosa@oglobo.com.br',
    licenseConfig: 'configs/enterprise',
    licenseAssignmentState: 'ASSIGNED',
    createTime: '2026-06-08T00:00:00',
    lastLoginTime: null,
  },
  {
    userPrincipal: 'luan.oliveira@oglobo.com.br',
    licenseConfig: 'configs/enterprise',
    licenseAssignmentState: 'ASSIGNED',
    createTime: '2025-10-01T00:00:00',
    lastLoginTime: '2025-10-01T00:00:00',
  },
  {
    userPrincipal: 'ana.souza@oglobo.com.br',
    licenseConfig: 'configs/enterprise',
    licenseAssignmentState: 'ASSIGNED',
    createTime: '2026-01-16T00:00:00',
    lastLoginTime: '2026-01-16T00:00:00',
  },
];

describe('InactivityReportModal', () => {
  it('renders a trigger button and no modal content until clicked', () => {
    render(<InactivityReportModal users={users} configs={configs} onRemove={() => {}} />);
    expect(screen.getByRole('button', { name: /relatório de inatividade/i })).toBeInTheDocument();
    expect(screen.queryByText('luan.oliveira@oglobo.com.br')).not.toBeInTheDocument();
  });

  it('shows only ASSIGNED users past the default 2-month threshold, most inactive first, with a summary count', async () => {
    const user = userEvent.setup();
    render(<InactivityReportModal users={users} configs={configs} onRemove={() => {}} />);

    await user.click(screen.getByRole('button', { name: /relatório de inatividade/i }));

    expect(screen.getByText(/2 de 3 usuários inativos/i)).toBeInTheDocument();
    expect(screen.queryByText('caio.rosa@oglobo.com.br')).not.toBeInTheDocument();

    const rows = screen.getAllByRole('row').slice(1); // drop header row
    expect(within(rows[0]).getByText('luan.oliveira@oglobo.com.br')).toBeInTheDocument();
    expect(within(rows[1]).getByText('ana.souza@oglobo.com.br')).toBeInTheDocument();
  });

  it('recomputes the list when the month threshold changes', async () => {
    const user = userEvent.setup();
    render(<InactivityReportModal users={users} configs={configs} onRemove={() => {}} />);
    await user.click(screen.getByRole('button', { name: /relatório de inatividade/i }));

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByText('12 meses'));

    expect(screen.getByText(/0 de 3 usuários inativos/i)).toBeInTheDocument();
    expect(screen.queryByText('luan.oliveira@oglobo.com.br')).not.toBeInTheDocument();
  });

  it('calls onRemove with the userPrincipal after confirming removal', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<InactivityReportModal users={users} configs={configs} onRemove={onRemove} />);
    await user.click(screen.getByRole('button', { name: /relatório de inatividade/i }));

    const rows = screen.getAllByRole('row').slice(1);
    await user.click(within(rows[0]).getByRole('button', { name: /remover/i }));
    await user.click(await screen.findByRole('button', { name: /^remover$/i }));

    expect(onRemove).toHaveBeenCalledWith('luan.oliveira@oglobo.com.br');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npm test -- InactivityReportModal`
Expected: FAIL — `Failed to resolve import "./InactivityReportModal"` (component does not exist yet).

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/InactivityReportModal.jsx`:

```jsx
import React, { useMemo, useState } from 'react';
import { Button, Modal, Select, Table, Tag, Typography, Space, Popconfirm } from 'antd';
import { ClockCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { renderLicenseTag, stateTag } from '../utils/licenseFormatting';
import {
  DEFAULT_INACTIVITY_MONTHS,
  INACTIVITY_MONTH_OPTIONS,
  buildInactivityReport,
  formatMonthsInactive,
} from '../utils/inactivity';

const { Text } = Typography;

export default function InactivityReportModal({ users, configs, onRemove }) {
  const [open, setOpen] = useState(false);
  const [thresholdMonths, setThresholdMonths] = useState(DEFAULT_INACTIVITY_MONTHS);

  const assignedTotal = useMemo(
    () => users.filter((u) => u.licenseAssignmentState === 'ASSIGNED').length,
    [users]
  );

  const report = useMemo(
    () => buildInactivityReport(users, thresholdMonths),
    [users, thresholdMonths]
  );

  const columns = [
    {
      title: 'Email',
      dataIndex: 'userPrincipal',
      key: 'userPrincipal',
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: 'Licença',
      dataIndex: 'licenseConfig',
      key: 'licenseConfig',
      render: (v) => renderLicenseTag(v, configs),
    },
    {
      title: 'Status',
      dataIndex: 'licenseAssignmentState',
      key: 'licenseAssignmentState',
      render: (v) => stateTag(v),
    },
    {
      title: 'Atribuída em',
      dataIndex: 'createTime',
      key: 'createTime',
      render: (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—'),
    },
    {
      title: 'Último acesso',
      dataIndex: 'lastLoginTime',
      key: 'lastLoginTime',
      render: (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—'),
    },
    {
      title: 'Tempo inativo',
      dataIndex: 'monthsInactive',
      key: 'monthsInactive',
      render: (v) => <Tag color="red">{formatMonthsInactive(v)}</Tag>,
    },
    {
      title: 'Ações',
      key: 'actions',
      width: 110,
      render: (_, record) => (
        <Popconfirm
          title={`Remover licença de ${record.userPrincipal}?`}
          description="A licença será desatribuída e o slot ficará disponível."
          onConfirm={() => onRemove(record.userPrincipal)}
          okText="Remover"
          cancelText="Cancelar"
          okButtonProps={{ danger: true }}
        >
          <Button danger icon={<DeleteOutlined />} size="small">Remover</Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <>
      <Button icon={<ClockCircleOutlined />} onClick={() => setOpen(true)}>
        Relatório de Inatividade
      </Button>
      <Modal
        title="Relatório de Usuários Inativos"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={900}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space>
            <Text>Inativo há mais de</Text>
            <Select
              value={thresholdMonths}
              onChange={setThresholdMonths}
              style={{ width: 140 }}
              options={INACTIVITY_MONTH_OPTIONS.map((m) => ({
                value: m,
                label: `${m} ${m === 1 ? 'mês' : 'meses'}`,
              }))}
            />
          </Space>
          <Text type="secondary">
            {report.length} de {assignedTotal} usuários inativos
          </Text>
          <Table
            dataSource={report}
            columns={columns}
            rowKey="userPrincipal"
            pagination={{ pageSize: 10 }}
            size="small"
            locale={{ emptyText: 'Nenhum usuário inativo neste período' }}
          />
        </Space>
      </Modal>
    </>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npm test -- InactivityReportModal`
Expected: PASS (4 tests). If the Select-option test fails to find "12 meses" because Ant Design renders the dropdown in a portal, note that `@testing-library/react`'s `screen` queries the full `document.body` by default, so the `await screen.findByText(...)` should still find it — no extra container option is needed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/InactivityReportModal.jsx frontend/src/components/InactivityReportModal.test.jsx
git commit -m "feat: add InactivityReportModal component"
```

---

### Task 5: Wire the report into `GeminiPage`

**Files:**
- Modify: `frontend/src/pages/GeminiPage.jsx:174-193`

**Interfaces:**
- Consumes: `InactivityReportModal` (default export, props `{ users, configs, onRemove }`) from Task 4; `users`, `configs`, `handleRemove` already exist as state/handlers in `GeminiPage.jsx`.
- Produces: nothing further downstream — this is the final integration point.

- [ ] **Step 1: Import the component**

In `frontend/src/pages/GeminiPage.jsx`, add this import alongside the existing ones (after the `licenseFormatting` import added in Task 2):

```jsx
import InactivityReportModal from '../components/InactivityReportModal';
```

- [ ] **Step 2: Render the button next to the existing header actions**

Replace the header actions `<Space>` block (originally lines 180-192):

```jsx
          <Space>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => fetchAll()} loading={loading}>
              Atualizar
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Adicionar usuário
            </Button>
          </Space>
```

with:

```jsx
          <Space>
            {lastUpdated && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
              </Text>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => fetchAll()} loading={loading}>
              Atualizar
            </Button>
            <InactivityReportModal users={users} configs={configs} onRemove={handleRemove} />
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Adicionar usuário
            </Button>
          </Space>
```

- [ ] **Step 3: Manually verify the end-to-end flow**

Run: `npm run dev` from the project root (starts backend on :3001 and frontend on :5173 via `concurrently`).

In the browser, on the Gemini Enterprise page:
1. Click "Relatório de Inatividade" — confirm the modal opens showing only `ASSIGNED` users whose reference date is 2+ months old, sorted most-inactive-first, with the "X de Y usuários inativos" summary text.
2. Change the months `Select` to `6` — confirm the list shrinks/changes accordingly, live, without closing the modal.
3. Click "Remover" on one row, confirm the `Popconfirm` — confirm the row disappears from both the modal's report and the main page table underneath (since `handleRemove` calls `fetchAll()`), and an Ant Design success `message` appears ("Licença de ... removida").
4. Close the modal via the `X` or by clicking outside, then reopen it — confirm the threshold `Select` still defaults back to 2 months (fresh component state) and the newly-removed user is gone for good (not just hidden).

Expected: all four checks pass with no console errors.

- [ ] **Step 4: Run the full frontend test suite one more time**

Run: `cd frontend && npm test`
Expected: PASS — all suites from Tasks 1–4 (sanity, licenseFormatting, inactivity, InactivityReportModal) green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/GeminiPage.jsx
git commit -m "feat: wire InactivityReportModal into the Gemini Enterprise page"
```
