import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type PaymentStatus =
  | "requires_human_approval"
  | "approved"
  | "rejected"
  | "sending"
  | "sent"
  | "failed";

type Payment = {
  id: string;
  fromAgentName?: string;
  fromAddress?: string;
  to: string;
  amountUsd: string;
  asset: "USDC";
  network: "base-sepolia" | "base";
  reason?: string;
  status: PaymentStatus;
  txHash?: string;
  error?: string;
  createdAt: string;
  approvedAt?: string;
  sentAt?: string;
};

type HomeState = {
  agentName: string;
  address: string;
  network: "base-sepolia" | "base";
  balances: {
    usdc: string;
    eth: string;
  };
  balanceError?: string;
  pendingPayments: Payment[];
  recentPayments: Payment[];
};

const STATUS_META: Record<PaymentStatus, { label: string; variant: string }> = {
  requires_human_approval: {
    label: "Needs approval",
    variant: "requires_human_approval",
  },
  approved: { label: "Approved", variant: "approved" },
  sending: { label: "Sending", variant: "sending" },
  sent: { label: "Sent", variant: "sent" },
  rejected: { label: "Rejected", variant: "rejected" },
  failed: { label: "Failed", variant: "failed" },
};

function App() {
  const approvalParams = useMemo(() => {
    const match = /^\/approve\/([^/]+)$/.exec(window.location.pathname);
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token") ?? "";
    if (token) {
      url.searchParams.delete("token");
      const search = url.searchParams.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${search ? `?${search}` : ""}${url.hash}`,
      );
    }
    return {
      paymentId: match?.[1],
      token,
    };
  }, []);

  return approvalParams.paymentId ? (
    <ApprovalPage
      paymentId={approvalParams.paymentId}
      token={approvalParams.token}
    />
  ) : (
    <HomePage />
  );
}

function HomePage() {
  const [state, setState] = useState<HomeState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<HomeState>("/api/state")
      .then(setState)
      .catch(setErrorFrom(setError));
  }, []);

  if (error) {
    return (
      <Shell title="Fuin Wallet">
        <ErrorText message={error} />
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell title="Fuin Wallet">
        <p className="empty">Loading...</p>
      </Shell>
    );
  }

  return (
    <Shell title="Fuin Wallet">
      <HeroBalance
        agentName={state.agentName}
        network={state.network}
        address={state.address}
        usdc={state.balances.usdc}
        eth={state.balances.eth}
      />

      {state.balanceError ? (
        <p className="warning">Balance lookup failed: {state.balanceError}</p>
      ) : null}

      <section>
        <h2>Pending approvals</h2>
        <PaymentList
          payments={state.pendingPayments}
          empty="No pending approvals."
        />
      </section>

      <section>
        <h2>Recent payments</h2>
        <PaymentList
          payments={state.recentPayments}
          empty="No recent payments."
        />
      </section>
    </Shell>
  );
}

function ApprovalPage({
  paymentId,
  token,
}: {
  paymentId: string;
  token: string;
}) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPayment = () => {
    fetchJson<Payment>(`/api/payments/${paymentId}`)
      .then(setPayment)
      .catch(setErrorFrom(setError));
  };

  useEffect(loadPayment, [paymentId]);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchJson<{ payment: Payment }>(
        `/api/payments/${paymentId}/approve`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ passphrase, token }),
        },
      );
      setPayment(result.payment);
      setPassphrase("");
    } catch (caughtError) {
      setError(errorToString(caughtError));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError(null);
    try {
      const result = await fetchJson<{ payment: Payment }>(
        `/api/payments/${paymentId}/reject`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        },
      );
      setPayment(result.payment);
    } catch (caughtError) {
      setError(errorToString(caughtError));
    } finally {
      setBusy(false);
    }
  }

  if (!payment) {
    return (
      <Shell title="Approve payment">
        <p className="empty">Loading...</p>
      </Shell>
    );
  }

  const canAct = payment.status === "requires_human_approval" && !busy;

  return (
    <Shell title="Approve payment">
      <section className="approvalHero card">
        <AmountDisplay amountUsd={payment.amountUsd} asset={payment.asset} />
        <div className="approvalHero__sub">
          <StatusBadge status={payment.status} />
          <span>{networkLabel(payment.network)}</span>
          {payment.fromAgentName ? (
            <span>via {payment.fromAgentName}</span>
          ) : null}
        </div>
      </section>

      <section className="approvalPanel">
        <Info
          label="Recipient"
          value={payment.to}
          mono
          action={<CopyButton value={payment.to} label="address" />}
        />
        <Info label="Asset" value={payment.asset} />
        <Info label="Reason" value={payment.reason || "No reason provided"} />
        {payment.txHash ? (
          <Info
            label="Tx hash"
            value={payment.txHash}
            mono
            action={<CopyButton value={payment.txHash} label="tx hash" />}
          />
        ) : null}
        {payment.error ? (
          <p className="warning">Error: {payment.error}</p>
        ) : null}
      </section>

      <section className="riskBox card">
        <h2>Risk warnings</h2>
        <ul>
          <li>This sends USDC on {networkLabel(payment.network)}.</li>
          <li>Your agent cannot send this without your local approval.</li>
          <li>Only approve if the recipient and amount are correct.</li>
          {payment.network === "base" ? (
            <li>Base mainnet uses real money.</li>
          ) : null}
        </ul>
      </section>

      {payment.status === "sent" && payment.txHash ? (
        <p className="success">Sent: {payment.txHash}</p>
      ) : null}

      {error ? <ErrorText message={error} /> : null}

      {payment.status === "requires_human_approval" ? (
        <div className="actions">
          <label className="passphrase">
            Passphrase
            <input
              autoComplete="current-password"
              disabled={busy}
              onChange={(event) => setPassphrase(event.target.value)}
              type="password"
              value={passphrase}
            />
          </label>
          <button
            className="approve"
            disabled={!canAct || passphrase.length === 0}
            onClick={approve}
            type="button"
          >
            Approve
          </button>
          <button disabled={!canAct} onClick={reject} type="button">
            Reject
          </button>
        </div>
      ) : null}
    </Shell>
  );
}

function Shell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <main>
      <header>
        <a className="brand" href="/">
          Fuin Wallet
        </a>
        <p>Local approval UI</p>
      </header>
      <h1>{title}</h1>
      {children}
    </main>
  );
}

function Info({
  label,
  mono,
  value,
  action,
}: {
  label: string;
  mono?: boolean;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="info">
      <div className="info__row">
        <div className="info__main">
          <dt>{label}</dt>
          <dd className={mono ? "mono" : undefined}>{value}</dd>
        </div>
        {action ? <div className="info__action">{action}</div> : null}
      </div>
    </div>
  );
}

function HeroBalance({
  agentName,
  network,
  address,
  usdc,
  eth,
}: {
  agentName: string;
  network: HomeState["network"];
  address: string;
  usdc: string;
  eth: string;
}) {
  return (
    <section className="hero card">
      <div className="heroTopRow">
        <span className="heroAgent">{agentName}</span>
        <span className="networkChip">{networkLabel(network)}</span>
      </div>
      <div className="heroAmount">
        <span className="heroAmount__symbol">$</span>
        <span>{usdc}</span>
        <span className="heroAmount__unit">USDC</span>
      </div>
      <div className="heroAmount__label">USDC balance</div>
      <div className="heroSecondary">
        <div className="heroSecondary__item">
          <span className="heroSecondary__label">ETH balance</span>
          <span className="heroSecondary__value">{eth}</span>
        </div>
        <div className="heroSecondary__item">
          <span className="heroSecondary__label">Address</span>
          <span className="heroSecondary__value">
            <span className="mono">{shorten(address)}</span>
            <CopyButton value={address} label="address" />
          </span>
        </div>
      </div>
    </section>
  );
}

function AmountDisplay({
  amountUsd,
  asset,
}: {
  amountUsd: string;
  asset: string;
}) {
  return (
    <div className="amountDisplay">
      <span className="amountDisplay__symbol">$</span>
      <span>{amountUsd}</span>
      <span className="amountDisplay__asset">{asset}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`badge badge--${meta.variant}`}>
      <span className="badge__dot" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleClick() {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        ok = true;
      } else {
        ok = fallbackCopy(value);
      }
    } catch {
      ok = fallbackCopy(value);
    }
    if (!ok) return;
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      className={`copyButton${copied ? " copyButton--copied" : ""}`}
      aria-label={`Copy ${label}`}
      onClick={handleClick}
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function fallbackCopy(value: string): boolean {
  try {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function PaymentList({
  empty,
  payments,
}: {
  empty: string;
  payments: Payment[];
}) {
  if (payments.length === 0) {
    return <p className="empty">{empty}</p>;
  }

  return (
    <div className="paymentList">
      {payments.map((payment) =>
        payment.status === "requires_human_approval" ? (
          <div className="paymentRow paymentRowStatic" key={payment.id}>
            <PaymentRowContent payment={payment} />
          </div>
        ) : (
          <a
            className="paymentRow"
            href={`/approve/${payment.id}`}
            key={payment.id}
          >
            <PaymentRowContent payment={payment} />
          </a>
        ),
      )}
    </div>
  );
}

function PaymentRowContent({ payment }: { payment: Payment }) {
  return (
    <>
      <span className="paymentRow__amount">
        ${payment.amountUsd} {payment.asset}
      </span>
      <span className="paymentRow__address">{shorten(payment.to)}</span>
      <span className="paymentRow__status">
        <StatusBadge status={payment.status} />
      </span>
    </>
  );
}

function ErrorText({ message }: { message: string }) {
  return <p className="error">{message}</p>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { referrerPolicy: "no-referrer", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? response.statusText);
  }
  return data as T;
}

function setErrorFrom(setError: (error: string) => void) {
  return (error: unknown) => setError(errorToString(error));
}

function errorToString(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function networkLabel(network: "base-sepolia" | "base"): string {
  return network === "base" ? "Base mainnet" : "Base Sepolia";
}

function shorten(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
