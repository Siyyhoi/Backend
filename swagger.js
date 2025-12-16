import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "🚀 BackEnd API",
      version: "1.0.0",
      description: `
# Welcome to the BackEnd API Documentation

This API provides comprehensive user management and authentication services.

## 🔐 Authentication
Most endpoints require JWT authentication. To authenticate:
1. Call \`POST /login\` with your credentials
2. Copy the returned \`token\`
3. Click the **Authorize** button above
4. Enter: \`Bearer <your-token>\`

## 📚 Quick Start
| Action | Endpoint | Auth Required |
|--------|----------|---------------|
| Health Check | \`GET /ping\` | ❌ |
| Login | \`POST /login\` | ❌ |
| Register | \`POST /users\` | ❌ |
| List Users | \`GET /users\` | ✅ |
| Update User | \`PUT /users/:id\` | ✅ |
| Delete User | \`DELETE /users/:id\` | ✅ |

---
      `,
      contact: {
        name: "API Support",
        email: "support@example.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    externalDocs: {
      description: "📖 Learn more about this API",
      url: "https://github.com/your-repo",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "🖥️ Development Server",
      },
      {
        url: "https://013-backend.vercel.app",
        description: "🌐 Production Server",
      },
    ],
    tags: [
      {
        name: "Health",
        description:
          "🏥 **Health Check Endpoints** — Monitor server and database status",
      },
      {
        name: "Authentication",
        description:
          "🔐 **Authentication** — Login, logout, and session management",
      },
      {
        name: "Users",
        description:
          "👥 **User Management** — CRUD operations for user accounts",
      },
      {
        name: "Misc",
        description: "🔧 **Miscellaneous** — Other utility endpoints",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Enter your JWT token. Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`",
        },
      },
      schemas: {
        User: {
          type: "object",
          description: "User account information (without sensitive data)",
          properties: {
            id: {
              type: "integer",
              example: 1,
              description: "Unique user identifier",
            },
            firstname: {
              type: "string",
              example: "John",
              description: "User's first name",
            },
            fullname: {
              type: "string",
              example: "John Doe",
              description: "User's full display name",
            },
            lastname: {
              type: "string",
              example: "Doe",
              description: "User's last name",
            },
            username: {
              type: "string",
              example: "johndoe",
              description: "Unique username for login",
            },
            status: {
              type: "string",
              example: "active",
              enum: ["active", "inactive", "suspended"],
              description: "Account status",
            },
            created_at: {
              type: "string",
              format: "date-time",
              description: "Account creation timestamp",
            },
            updated_at: {
              type: "string",
              format: "date-time",
              description: "Last update timestamp",
            },
          },
        },
        UserInput: {
          type: "object",
          description: "Required fields for creating a new user",
          required: [
            "firstname",
            "fullname",
            "lastname",
            "username",
            "password",
          ],
          properties: {
            firstname: {
              type: "string",
              example: "John",
              minLength: 1,
              maxLength: 50,
              description: "User's first name",
            },
            fullname: {
              type: "string",
              example: "John Doe",
              minLength: 1,
              maxLength: 100,
              description: "User's full display name",
            },
            lastname: {
              type: "string",
              example: "Doe",
              minLength: 1,
              maxLength: 50,
              description: "User's last name",
            },
            username: {
              type: "string",
              example: "johndoe",
              minLength: 3,
              maxLength: 30,
              description: "Unique username for login (3-30 characters)",
            },
            password: {
              type: "string",
              example: "password123",
              minLength: 6,
              description: "Password (minimum 6 characters)",
            },
            status: {
              type: "string",
              example: "active",
              default: "active",
              enum: ["active", "inactive"],
              description: "Account status (defaults to 'active')",
            },
          },
        },
        LoginInput: {
          type: "object",
          description: "Credentials for user authentication",
          required: ["username", "password"],
          properties: {
            username: {
              type: "string",
              example: "johndoe",
              description: "Your registered username",
            },
            password: {
              type: "string",
              example: "password123",
              description: "Your account password",
            },
          },
        },
        LoginResponse: {
          type: "object",
          description: "Successful login response with JWT token",
          properties: {
            message: {
              type: "string",
              example: "Login successful",
            },
            token: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
              description: "JWT token valid for 1 hour",
            },
          },
        },
        SuccessResponse: {
          type: "object",
          description: "Generic success response",
          properties: {
            status: {
              type: "string",
              example: "ok",
            },
            message: {
              type: "string",
              example: "Operation completed successfully",
            },
          },
        },
        ErrorResponse: {
          type: "object",
          description: "Error response structure",
          properties: {
            status: {
              type: "string",
              example: "error",
            },
            message: {
              type: "string",
              example: "An error occurred",
            },
            code: {
              type: "string",
              nullable: true,
              example: "ER_DUP_ENTRY",
              description: "Error code (if available)",
            },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: "🔒 Authentication required or invalid token",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: { type: "string", example: "No token provided" },
                },
              },
            },
          },
        },
        NotFound: {
          description: "🔍 Resource not found",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "not_found" },
                  message: { type: "string", example: "User not found" },
                },
              },
            },
          },
        },
        ServerError: {
          description: "💥 Internal server error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ErrorResponse",
              },
            },
          },
        },
      },
    },
  },
  apis: ["./index.js"],
};

const specs = swaggerJsdoc(options);

export { swaggerUi, specs };
