const metrics = {
  chatRequests: 0,
  leadRequests: 0,
  chatErrors: 0,
  leadErrors: 0,
  leadCreated: 0,
  totalChatLatencyMs: 0
};

function trackChat({ ok, latencyMs }) {
  metrics.chatRequests += 1;
  metrics.totalChatLatencyMs += latencyMs || 0;
  if (!ok) metrics.chatErrors += 1;
}

function trackLead({ ok, created }) {
  metrics.leadRequests += 1;
  if (!ok) metrics.leadErrors += 1;
  if (created) metrics.leadCreated += 1;
}

function getMetrics() {
  const avgChatLatencyMs =
    metrics.chatRequests > 0 ? Math.round(metrics.totalChatLatencyMs / metrics.chatRequests) : 0;
  const leadCaptureRate =
    metrics.chatRequests > 0 ? Number((metrics.leadCreated / metrics.chatRequests).toFixed(3)) : 0;

  return {
    ...metrics,
    avgChatLatencyMs,
    leadCaptureRate
  };
}

module.exports = {
  trackChat,
  trackLead,
  getMetrics
};
