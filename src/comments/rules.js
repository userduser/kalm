// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
// Defaults and tuning. User domains are loaded from local settings at startup.
globalThis.__YTCommentFilterStarters = [];
globalThis.__YT_COMMENT_FILTER_RULES__ = Object.freeze({
  blockedDomains: globalThis.__YTCommentFilterSettings.DEFAULT_DOMAINS,
  blockChannelLinks: true,
  urlCacheSize: 256,
  profileConcurrency: 3,
  profileCacheHours: 24,
  profileCacheMaxEntries: 2000,
  profileTimeoutMs: 10000,
});
