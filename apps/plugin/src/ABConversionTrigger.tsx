import { useEffect, useRef, type ReactNode } from "react";
import { addPropertyControls, ControlType } from "framer";

export default function ABConversionTrigger({
  experimentId = "",
  writeKey = "",
  eventName = "conversion",
  triggerOn = "click",
  children,
  respectConsent = false,
  consentCookieName = "cookie_consent",
  apiUrl = "https://ab-testing-worker.kenbonfloziio.workers.dev ",
}: {
  experimentId?: string;
  writeKey?: string;
  eventName?: string;
  triggerOn?: "click" | "mount" | "visible" | "submit";
  children?: ReactNode;
  respectConsent?: boolean;
  consentCookieName?: string;
  apiUrl?: string;
}) {
  const firedRef = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  const hasConsent = () => {
    if (!respectConsent) return true;
    const c = document.cookie
      .split("; ")
      .find((r) => r.startsWith(`${consentCookieName}=`));
    if (!c) return false;
    const v = c.split("=").slice(1).join("=");
    return v === "true" || v === "accepted" || v === "1";
  };

  const track = () => {
    if (!hasConsent()) return;
    const variantCookie = document.cookie
      .split("; ")
      .find((r) => r.startsWith(`ab_${experimentId}=`));
    if (!variantCookie) return;
    const variant = variantCookie.split("=").slice(1).join("=");
    if (variant !== "A" && variant !== "B") return;
    const visitorId = localStorage.getItem(`ab-user-${experimentId}`) ?? null;
    fetch(`${apiUrl}/v1/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${writeKey}`,
      },
      body: JSON.stringify({
        experiment_id: experimentId,
        type: eventName,
        variant,
        visitor_id: visitorId,
      }),
    }).catch(() => {});
  };

  useEffect(() => {
    if (triggerOn === "mount") {
      track();
      return;
    }
    if (triggerOn === "visible" && ref.current) {
      const obs = new IntersectionObserver(
        ([e]) => {
          if (e.isIntersecting && !firedRef.current) {
            firedRef.current = true;
            track();
            obs.disconnect();
          }
        },
        { threshold: 0.5 },
      );
      obs.observe(ref.current);
      return () => obs.disconnect();
    }
    if (triggerOn === "submit" && ref.current) {
      const el = ref.current as any;
      const form = el.tagName === "FORM" ? el : el.querySelector("form");
      if (form) {
        const handleSubmit = (e: Event) => {
          if (!firedRef.current) {
            firedRef.current = true;
            track();
          }
        };
        form.addEventListener("submit", handleSubmit);
        return () => form.removeEventListener("submit", handleSubmit);
      }
    }
  }, []);

  if (triggerOn === "click") {
    return (
      <div
        ref={ref}
        onClick={() => {
          if (!firedRef.current) {
            firedRef.current = true;
            track();
          }
        }}
      >
        {children}
      </div>
    );
  }
  return <div ref={ref}>{children}</div>;
}

addPropertyControls(ABConversionTrigger, {
  experimentId: {
    type: ControlType.String,
    title: "Experiment ID",
    defaultValue: "3a9fe711-74ec-4d14-910b-666214557e54",
  },
  writeKey: {
    type: ControlType.String,
    title: "Write Key",
    defaultValue: "c166d76d-8320-4f93-a035-ee92be66751c",
  },
  eventName: {
    type: ControlType.String,
    title: "Event Name",
    defaultValue: "conversion",
  },
  triggerOn: {
    type: ControlType.Enum,
    title: "Trigger On",
    options: ["click", "mount", "visible", "submit"],
    defaultValue: "click",
  },
  children: { type: ControlType.Slot, title: "Children" },
  respectConsent: {
    type: ControlType.Boolean,
    title: "Respect Consent",
    defaultValue: false,
  },
  consentCookieName: {
    type: ControlType.String,
    title: "Consent Cookie Name",
    defaultValue: "cookie_consent",
  },
  apiUrl: {
    type: ControlType.String,
    title: "API URL",
    defaultValue: "https://ab-testing-worker.kenbonfloziio.workers.dev ",
  },
});
