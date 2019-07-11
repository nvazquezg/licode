module.exports = {
  /**
   * Application configuration section
   * http://pm2.keymetrics.io/docs/usage/application-declaration/
   */
  apps : [

    // First application
    {
      name      : 'ERIZO-AGENT',
      script    : 'erizoAgent.js',
      interpreter: 'node@6.14.4',
      env: {
        COMMON_VARIABLE: 'true',
	    LD_LIBRARY_PATH: '../../erizo/build/release/erizo/:../../build/libdeps/build/lib/'
      },
      env_production : {
        NODE_ENV: 'production'
      }
    }
  ]
};
