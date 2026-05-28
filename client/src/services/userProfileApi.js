async function requestJson(path, options) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function getUserProfile() {
  const data = await requestJson('/api/user/profile');
  return data?.profile ?? null;
}

export async function analyzeProfile(questionnaire) {
  const data = await requestJson('/api/user/profile/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionnaire }),
  });
  return data?.profile ?? null;
}

export async function skipOnboarding() {
  return requestJson('/api/user/profile/skip', { method: 'POST' });
}
