const DEFAULT_TIMEOUT_MS = Number(process.env.AIMHARDER_TIMEOUT_MS || 10000);

const tokenState = {
  accessToken: (process.env.AIMHARDER_ACCESS_TOKEN || '').trim(),
  refreshToken: (process.env.AIMHARDER_REFRESH_TOKEN || '').trim()
};

function isEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function isAimharderEnabled() {
  return isEnabled(process.env.AIMHARDER_ENABLED);
}

function baseUrl() {
  return (process.env.AIMHARDER_BASE_URL || 'https://api.aimharder.com').replace(/\/+$/, '');
}

function bookingGuestPath() {
  return process.env.AIMHARDER_BOOKING_GUEST_PATH || '/classes/booking/guest';
}

function tokenRefreshPath() {
  return process.env.AIMHARDER_TOKEN_REFRESH_PATH || '/auth/tokens/refresh';
}

function getTokens() {
  return {
    accessToken: tokenState.accessToken,
    refreshToken: tokenState.refreshToken
  };
}

function setTokens(next) {
  if (next?.accessToken) tokenState.accessToken = String(next.accessToken).trim();
  if (next?.refreshToken) tokenState.refreshToken = String(next.refreshToken).trim();
}

function hasInitialTokens() {
  return Boolean(tokenState.accessToken);
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch (_) {
    return null;
  }
}

function withTimeout(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}

function shouldRetryTechnical(status, errorCode) {
  if (errorCode === 'ABORT_ERR') return true;
  return status >= 500 && status < 600;
}

async function refreshAccessToken() {
  const accessToken = tokenState.accessToken;
  if (!accessToken) {
    return {
      ok: false,
      status: null,
      code: 'MISSING_ACCESS_TOKEN'
    };
  }

  const { signal, cleanup } = withTimeout();
  try {
    const response = await fetch(`${baseUrl()}${tokenRefreshPath()}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      signal
    });

    const data = await safeReadJson(response);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        code: 'REFRESH_FAILED',
        data
      };
    }

    const nextAccess = data?.['access-token'];
    const nextRefresh = data?.['refresh-token'];
    if (!nextAccess) {
      return {
        ok: false,
        status: response.status,
        code: 'REFRESH_RESPONSE_INVALID',
        data
      };
    }

    setTokens({ accessToken: nextAccess, refreshToken: nextRefresh || tokenState.refreshToken });
    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: null,
      code: error?.name === 'AbortError' ? 'REFRESH_TIMEOUT' : 'REFRESH_NETWORK_ERROR'
    };
  } finally {
    cleanup();
  }
}

async function request({
  path,
  method = 'GET',
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryTechnical = 1,
  retryAuth = 1
}) {
  if (!isAimharderEnabled()) {
    return { ok: false, status: null, code: 'AIMHARDER_DISABLED' };
  }
  if (!hasInitialTokens()) {
    return { ok: false, status: null, code: 'AIMHARDER_TOKENS_MISSING' };
  }

  let technicalAttempts = 0;
  let authAttempts = 0;

  while (true) {
    const { signal, cleanup } = withTimeout(timeoutMs);
    let response;
    let data;

    try {
      response = await fetch(`${baseUrl()}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${tokenState.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined,
        signal
      });
      data = await safeReadJson(response);
    } catch (error) {
      cleanup();
      const code = error?.name === 'AbortError' ? 'ABORT_ERR' : 'NETWORK_ERR';
      if (technicalAttempts < retryTechnical && shouldRetryTechnical(500, code)) {
        technicalAttempts += 1;
        continue;
      }
      return { ok: false, status: null, code, data: null };
    } finally {
      cleanup();
    }

    if (response.ok) {
      return { ok: true, status: response.status, data };
    }

    if ((response.status === 401 || response.status === 410) && authAttempts < retryAuth) {
      authAttempts += 1;
      const refreshed = await refreshAccessToken();
      if (refreshed.ok) continue;
      return {
        ok: false,
        status: response.status,
        code: 'AUTH_REFRESH_FAILED',
        data: data || refreshed
      };
    }

    if (technicalAttempts < retryTechnical && shouldRetryTechnical(response.status, null)) {
      technicalAttempts += 1;
      continue;
    }

    return {
      ok: false,
      status: response.status,
      code: 'HTTP_ERROR',
      data
    };
  }
}

module.exports = {
  isAimharderEnabled,
  bookingGuestPath,
  request,
  getTokens,
  hasInitialTokens
};

