const verifyToken = async (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.redirect(301, '/api/auth/login');
};

export default verifyToken;
