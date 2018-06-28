module.exports = {
  /**
   * Application configuration section
   * http://pm2.keymetrics.io/docs/usage/application-declaration/
   */
  apps : [

    // First application
    {
      name      : 'NUVE',
      script    : 'nuve.js',
      env: {
        COMMON_VARIABLE: 'true'
      },
      env_production : {
        NODE_ENV: 'production'
      }
    }

    // Second application
      /**
    {
      name      : 'WEB',
      script    : 'web.js'
    }*/
  ]
};
