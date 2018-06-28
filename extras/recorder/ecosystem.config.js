module.exports = {
  /**
   * Application configuration section
   * http://pm2.keymetrics.io/docs/usage/application-declaration/
   */
  apps : [

    // First application
    {
      name      : 'RECORDER',
      script    : 'recorder.js',
      interpreter: 'node@6.9.2',
      env: {
        COMMON_VARIABLE: 'true',
        LD_LIBRARY_PATH: '../../erizo/build/release/erizo/:../../build/libdeps/build/lib/',
        API: 'http://10.201.54.155/api/'
      },
      env_production : {
        NODE_ENV: 'production',
        API: 'http://192.168.202.9/api/'
      }
    }
  ]
};
