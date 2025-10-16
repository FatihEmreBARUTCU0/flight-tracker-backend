import swaggerJsdoc from "swagger-jsdoc";
export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.1.0",
    info: { title: "Flight Tracker API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000" }],
    components:{ schemas:{ Flight:{ type:"object", properties:{
      code:{type:"string"}, from:{type:"string"}, to:{type:"string"} }, required:["code","from","to"]}}}
  },
  apis: ["./src/routes/**/*.ts", "./src/app.ts"],
});