"use client";

import { useCallback, useEffect, useState } from "react";

type GooglePromptNotification = {
  isNotDisplayed?: () => boolean;
  isSkippedMoment?: () => boolean;
  isDismissedMoment?: () => boolean;
};

type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        auto_select?: boolean;
        ux_mode?: "popup" | "redirect";
        context?: "signin" | "signup";
      }) => void;
      prompt: (listener?: (notification: GooglePromptNotification) => void) => void;
    };
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: { access_token?: string; error?: string }) => void;
      }) => { requestAccessToken: () => void };
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

type Props = {
  clientId: string;
  label: string;
  disabled?: boolean;
  onError: (message: string) => void;
  onSignedIn: (result: { role?: string; user?: { id?: string } }) => void;
};

async function postGoogleCredential(body: { idToken?: string; accessToken?: string }) {
  const response = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const result = await response.json() as { error?: string; role?: string; user?: { id?: string } };
  if (!response.ok) throw new Error(result.error ?? "GOOGLE_AUTH_FAILED");
  return result;
}

export function GoogleSignInButton({ clientId, label, disabled, onError, onSignedIn }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    const existing = document.querySelector<HTMLScriptElement>("script[data-wazen-gsi]");
    if (existing && window.google?.accounts?.id) {
      setReady(true);
      return;
    }
    const script = existing ?? document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.dataset.wazenGsi = "1";
    script.onload = () => setReady(true);
    script.onerror = () => onError("GOOGLE_AUTH_FAILED");
    if (!existing) document.head.appendChild(script);
  }, [clientId]);

  const signIn = useCallback(() => {
    if (!clientId || disabled) return;
    const google = window.google;
    if (!google?.accounts?.id) {
      onError("GOOGLE_AUTH_FAILED");
      return;
    }
    google.accounts.id.initialize({
      client_id: clientId,
      auto_select: false,
      ux_mode: "popup",
      callback: (response) => {
        void (async () => {
          try {
            if (!response.credential) throw new Error("GOOGLE_AUTH_FAILED");
            onSignedIn(await postGoogleCredential({ idToken: response.credential }));
          } catch (caught) {
            onError(caught instanceof Error ? caught.message : "GOOGLE_AUTH_FAILED");
          }
        })();
      },
    });
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.() || notification.isDismissedMoment?.()) {
        google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "openid email profile",
          callback: (tokenResponse) => {
            void (async () => {
              try {
                if (tokenResponse.error || !tokenResponse.access_token) throw new Error("GOOGLE_AUTH_FAILED");
                onSignedIn(await postGoogleCredential({ accessToken: tokenResponse.access_token }));
              } catch (caught) {
                onError(caught instanceof Error ? caught.message : "GOOGLE_AUTH_FAILED");
              }
            })();
          },
        }).requestAccessToken();
      }
    });
  }, [clientId, disabled, onError, onSignedIn]);

  return (
    <button type="button" className="auth-google" onClick={signIn} disabled={disabled || !ready}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46c-.28 1.5-1.12 2.77-2.39 3.63v3.02h3.86c2.26-2.08 3.56-5.14 3.56-8.68z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.86-3.02c-1.07.72-2.44 1.15-4.08 1.15-3.14 0-5.8-2.12-6.76-4.97H1.27v3.11C3.24 21.53 7.31 24 12 24z" />
        <path fill="#FBBC05" d="M5.24 14.25A7.2 7.2 0 0 1 4.86 12c0-.78.14-1.53.38-2.25V6.64H1.27A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.27 5.36l3.97-3.11z" />
        <path fill="#EA4335" d="M12 4.75c1.76 0 3.33.6 4.58 1.79l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.24 2.47 1.27 6.64l3.97 3.11C6.2 6.87 8.86 4.75 12 4.75z" />
      </svg>
      {label}
    </button>
  );
}
