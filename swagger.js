import swaggerUi from "swagger-ui-express";

// Define OpenAPI spec directly (no file reading needed - works on Vercel)
const specs = {
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
| Login | \`POST /api/login\` | ❌ |
| Register | \`POST /api/users\` | ❌ |
| Logout | \`POST /api/logout\` | ✅ |
| List Users | \`GET /api/users\` | ✅ |
| Get User | \`GET /api/users/:id\` | ✅ |
| Update User | \`PUT /api/users/:id\` | ✅ |
| Delete User | \`DELETE /api/users/:id\` | ✅ |

---
    `,
    contact: {
      name: "API Support",
      email: "siyyhoi@gmail.com",
    },
    license: {
      name: "MIT",
      url: "https://opensource.org/licenses/MIT",
    },
  },
  externalDocs: {
    description: "📖 Learn more about this API",
    url: "",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "🖥️ Development Server",
    },
    {
      url: "",
      description: "🌐 Production Server",
    },
  ],
  tags: [
    {
      name: "Authentication",
      description:
        "🔐 **Authentication** — Login, logout, and session management",
    },
    {
      name: "Users",
      description: "👥 **User Management** — CRUD operations for user accounts",
    },
    {
      name: "Misc",
      description: "🔧 **Miscellaneous** — Other utility endpoints",
    },
  ],
  paths: {
    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "Get all users",
        description: "Retrieve a paginated list of all users",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "query",
            name: "limit",
            schema: { type: "integer", minimum: 1, maximum: 100 },
            description: "Number of users per page",
          },
          {
            in: "query",
            name: "page",
            schema: { type: "integer", minimum: 1 },
            description: "Page number",
          },
        ],
        responses: {
          200: {
            description: "List of users",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    count: { type: "integer" },
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/User" },
                    },
                    total: { type: "integer" },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
          500: { description: "Database error" },
        },
      },
      post: {
        tags: ["Users"],
        summary: "Create a new user",
        description: "Register a new user account",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UserInput" },
            },
          },
        },
        responses: {
          201: {
            description: "User created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    id: { type: "integer" },
                    firstname: { type: "string" },
                    fullname: { type: "string" },
                    lastname: { type: "string" },
                    username: { type: "string" },
                    userStatus: {
                      type: "string",
                      description:
                        "User account status (e.g., active, inactive)",
                    },
                  },
                },
              },
            },
          },
          400: { description: "Bad request - missing required fields" },
          500: { description: "Database error" },
        },
      },
    },
    "/api/users/{id}": {
      get: {
        tags: ["Users"],
        summary: "Get user by ID",
        description: "Retrieve a single user by their ID",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
            description: "User ID",
          },
        ],
        responses: {
          200: {
            description: "User found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    data: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
          404: { description: "User not found" },
          500: { description: "Database error" },
        },
      },
      put: {
        tags: ["Users"],
        summary: "Update user",
        description: "Update an existing user's information",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
            description: "User ID",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  firstname: { type: "string" },
                  fullname: { type: "string" },
                  lastname: { type: "string" },
                  username: { type: "string" },
                  password: { type: "string" },
                  status: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "User updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    message: {
                      type: "string",
                      example: "User updated successfully",
                    },
                  },
                },
              },
            },
          },
          400: { description: "No fields to update" },
          401: { description: "Unauthorized" },
          404: { description: "User not found" },
          500: { description: "Database error" },
        },
      },
      delete: {
        tags: ["Users"],
        summary: "Delete user",
        description: "Delete a user by their ID",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "integer" },
            description: "User ID",
          },
        ],
        responses: {
          200: {
            description: "User deleted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    message: {
                      type: "string",
                      example: "User deleted successfully",
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
          404: { description: "User not found" },
          500: { description: "Database error" },
        },
      },
    },
    "/api/login": {
      post: {
        tags: ["Authentication"],
        summary: "User login",
        description: "Authenticate user and receive a JWT token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginInput" },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Login successful" },
                    token: {
                      type: "string",
                      description: "JWT token for authentication",
                    },
                  },
                },
              },
            },
          },
          400: { description: "Missing required fields" },
          401: { description: "Invalid credentials" },
          500: { description: "Login failed" },
        },
      },
    },
    "/api/logout": {
      post: {
        tags: ["Authentication"],
        summary: "User logout",
        description: "Invalidate the current user's session",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Logged out successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    message: { type: "string", example: "Logged out" },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/api/data": {
      get: {
        tags: ["Misc"],
        summary: "Test CORS endpoint",
        description: "Simple endpoint to test CORS configuration",
        responses: {
          200: {
            description: "CORS test successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Hello, CORS!" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
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
        required: ["firstname", "fullname", "lastname", "username", "password"],
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
          message: { type: "string", example: "Login successful" },
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
          status: { type: "string", example: "ok" },
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
          status: { type: "string", example: "error" },
          message: { type: "string", example: "An error occurred" },
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
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  },
};

export { swaggerUi, specs };
