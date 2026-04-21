export default function authMiddleware(req, res, next) {
  req.user = {
    id: "dev-user",
    tenantId: "alpha-dev",
  };

  next();
}