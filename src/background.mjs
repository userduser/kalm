// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Kalm contributors.
// Load the unchanged platform engine, then apply Kalm's toolbar colors.
import '../js/background.js';
import { colorBadge } from './ui/badge.mjs';

colorBadge((globalThis.browser || globalThis.chrome)?.action);
