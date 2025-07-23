# Code Style and Conventions

## JavaScript Style
- **ES6+ Features**: Uses modern JavaScript (const/let, arrow functions, async/await)
- **Semicolons**: Used consistently at end of statements
- **Quotes**: Single quotes for strings (e.g., 'string')
- **Indentation**: 2 spaces (standard for Node.js projects)
- **File Naming**: Kebab-case for files (e.g., `voice.controller.js`)
- **Variable Naming**: camelCase for variables and functions
- **Class Naming**: PascalCase for classes and constructors

## Project Structure Patterns
- **Controllers**: Handle HTTP requests/responses (`*.controller.js`)
- **Services**: Business logic layer (`services/*/`)
- **Routes**: Express route definitions (`routes/*.routes.js`)
- **Models**: Database schemas (Prisma in `models/prisma/`)
- **Middleware**: Express middleware functions
- **Utils**: Utility/helper functions

## Async Patterns
- Prefer `async/await` over callbacks
- Use try/catch blocks for error handling
- Handle Promise rejections properly

## Error Handling
- Centralized error handling middleware
- Custom error classes for different error types
- Consistent error response format
- Winston logger for error logging

## Module Pattern
- CommonJS modules (require/module.exports)
- Destructuring imports where appropriate
- Group related imports together

## Comments and Documentation
- JSDoc comments for functions when needed
- Inline comments for complex logic
- No excessive commenting for self-explanatory code

## Testing Conventions
- Test files named `*.test.js` or `*.spec.js`
- Jest as testing framework
- Descriptive test names
- Arrange-Act-Assert pattern

## Environment Variables
- All config in `.env` file
- Never commit secrets to repository
- Use descriptive names in UPPER_SNAKE_CASE

## API Conventions
- RESTful endpoints
- Consistent response format
- Proper HTTP status codes
- Request validation with Joi or express-validator