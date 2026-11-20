const ACCESS_COOKIE_MAX_AGE = 15 * 60 * 1000;
const sameSite = () => (process.env.NODE_ENV === 'production' ? 'none' : 'lax');

export const cookies = {
  setSession: (res, accessToken) => {
    const sharedOptions = {
      secure: process.env.NODE_ENV === 'production',
      sameSite: sameSite(),
      path: '/',
      maxAge: ACCESS_COOKIE_MAX_AGE,
    };
    res.cookie('token', accessToken, { ...sharedOptions, httpOnly: true });
  },
  clearSession: res => {
    const sharedOptions = {
      secure: process.env.NODE_ENV === 'production',
      sameSite: sameSite(),
      path: '/',
    };
    res.clearCookie('token', { ...sharedOptions, httpOnly: true });
  },
};
