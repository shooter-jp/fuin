import { StrictMode, useEffect, useMemo, useState } from "react";
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

function App() {
  const approvalParams = useMemo(() => {
    const match = /^\/approve\/([^/]+)$/.exec(window.location.pathname);
    return {
      paymentId: match?.[1],
      token: new URLSearchParams(window.location.search).get("token") ?? "",
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
        <p>Loading...</p>
      </Shell>
    );
  }

  return (
    <Shell title="Fuin Wallet">
      <section className="summaryGrid">
        <Info label="Agent" value={state.agentName} />
        <Info label="Network" value={networkLabel(state.network)} />
        <Info label="Address" value={state.address} mono />
        <Info label="USDC" value={state.balances.usdc} />
        <Info label="ETH" value={state.balances.eth} />
      </section>

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
        <p>Loading...</p>
      </Shell>
    );
  }

  const canAct = payment.status === "requires_human_approval" && !busy;

  return (
    <Shell title="Approve payment">
      <section className="approvalPanel">
        <Info label="Agent" value={payment.fromAgentName ?? "Fuin Agent"} />
        <Info label="Amount" value={`$${payment.amountUsd}`} />
        <Info label="Asset" value={payment.asset} />
        <Info label="Recipient" value={payment.to} mono />
        <Info label="Network" value={networkLabel(payment.network)} />
        <Info label="Reason" value={payment.reason || "No reason provided"} />
        <Info label="Status" value={payment.status} />
        {payment.txHash ? (
          <Info label="Tx hash" value={payment.txHash} mono />
        ) : null}
        {payment.error ? (
          <p className="warning">Error: {payment.error}</p>
        ) : null}
      </section>

      <section className="riskBox">
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
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="info">
      <dt>{label}</dt>
      <dd className={mono ? "mono" : undefined}>{value}</dd>
    </div>
  );
}

function PaymentList({
  empty,
  payments,
}: {
  empty: string;
  payments: Payment[];
}) {
  if (payments.length === 0) {
    return <p>{empty}</p>;
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
      <span>
        ${payment.amountUsd} {payment.asset}
      </span>
      <span className="mono">{shorten(payment.to)}</span>
      <span>{payment.status}</span>
    </>
  );
}

function ErrorText({ message }: { message: string }) {
  return <p className="error">{message}</p>;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
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
