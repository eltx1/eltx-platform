function getEmailEnvDefaults() {
  return {
    host: process.env.EMAIL_HOST || null,
    port: process.env.EMAIL_PORT || null,
    secure: process.env.EMAIL_SECURE || null,
    user: process.env.EMAIL_USER || null,
    pass: process.env.EMAIL_PASS || null,
    fromName: process.env.EMAIL_FROM_NAME || null,
    fromAddress: process.env.EMAIL_FROM_ADDRESS || null,
  };
}

module.exports = { getEmailEnvDefaults };
