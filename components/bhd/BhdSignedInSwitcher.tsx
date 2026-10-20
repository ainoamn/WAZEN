"use client";

import { BhdAppSwitcher, type BhdSwitcherUser } from "./BhdAppSwitcher";
import { useBhdAccountMenu } from "./useBhdAccountMenu";

export function BhdSignedInSwitcher({
  user,
  locale = "ar",
}: {
  user: BhdSwitcherUser;
  locale?: "ar" | "en";
}) {
  const menu = useBhdAccountMenu(user, locale);
  return (
    <BhdAppSwitcher
      user={menu.user}
      accounts={menu.accounts}
      locale={locale}
      onSignOut={() => void menu.signOutThis()}
      onSignOutAll={() => void menu.signOutAll()}
      onSwitchAccount={(sub) => void menu.switchAccount(sub)}
      onAddAccount={menu.addAccount}
    />
  );
}
