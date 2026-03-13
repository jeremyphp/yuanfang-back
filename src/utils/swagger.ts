import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '元方AI服务平台 API',
      version: '1.0.0',
      description: '元方AI服务平台后端API文档',
      contact: {
        name: 'API Support',
        email: 'support@yuanfang.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000/api',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts'], // files containing annotations
};

export const createSwaggerSpec = () => {
  return swaggerJsdoc(options);
};