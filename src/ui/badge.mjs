// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
// Keep the native request counter; only change its colors.
export async function colorBadge(action) {
  await Promise.allSettled(
    Object.entries({
      setBadgeBackgroundColor: '#2d7046',
      setBadgeTextColor: '#f2fff4',
    }).map(async ([method, color]) => {
      if (typeof action?.[method] === 'function') await action[method]({ color });
    }),
  );
}
