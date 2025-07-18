const request = require('supertest');
const app = require('../app');
const { prisma } = require('../config/database');

describe('OAuth Integration Tests', () => {
  let authToken;
  let userId;

  beforeAll(async () => {
    // Create a test user
    const testUser = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        provider: 'apple',
        providerId: 'test-apple-id'
      }
    });
    userId = testUser.id;

    // Mock auth token (in real tests, you'd get this from auth endpoint)
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.oAuthState.deleteMany({
      where: { userId }
    });
    await prisma.integration.deleteMany({
      where: { userId }
    });
    await prisma.user.delete({
      where: { id: userId }
    });
  });

  describe('Google OAuth Flow', () => {
    test('should initiate Google OAuth flow', async () => {
      const response = await request(app)
        .get('/api/oauth/google/init')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(response.body.state).toBeDefined();
    });

    test('should handle Google OAuth callback', async () => {
      // Create a test OAuth state
      const oauthState = await prisma.oAuthState.create({
        data: {
          state: 'test-state-123',
          userId,
          provider: 'google',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      });

      // Mock callback (in real tests, you'd simulate the actual OAuth flow)
      const response = await request(app)
        .get('/api/oauth/google/callback')
        .query({
          code: 'mock-auth-code',
          state: 'test-state-123'
        })
        .expect(302);

      expect(response.headers.location).toContain('success=google_connected');
    });
  });

  describe('Airtable OAuth Flow', () => {
    test('should initiate Airtable OAuth flow', async () => {
      const response = await request(app)
        .get('/api/oauth/airtable/init')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.authUrl).toContain('https://airtable.com/oauth2/v1/authorize');
      expect(response.body.state).toBeDefined();
    });

    test('should handle Airtable OAuth callback', async () => {
      // Create a test OAuth state
      const oauthState = await prisma.oAuthState.create({
        data: {
          state: 'test-airtable-state-123',
          userId,
          provider: 'airtable',
          codeVerifier: 'test-code-verifier',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      });

      // Mock callback
      const response = await request(app)
        .get('/api/oauth/airtable/callback')
        .query({
          code: 'mock-auth-code',
          state: 'test-airtable-state-123'
        })
        .expect(302);

      expect(response.headers.location).toContain('success=airtable_connected');
    });
  });

  describe('Integration Management', () => {
    let integrationId;

    beforeEach(async () => {
      // Create a test integration
      const integration = await prisma.integration.create({
        data: {
          userId,
          type: 'google',
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          tokenType: 'Bearer',
          expiresAt: new Date(Date.now() + 3600 * 1000),
          scope: 'calendar email',
          isActive: true,
          serviceData: {
            userInfo: {
              email: 'test@example.com',
              name: 'Test User'
            }
          }
        }
      });
      integrationId = integration.id;
    });

    afterEach(async () => {
      // Clean up test integration
      await prisma.integration.deleteMany({
        where: { id: integrationId }
      });
    });

    test('should list user integrations', async () => {
      const response = await request(app)
        .get('/api/oauth/integrations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.integrations).toHaveLength(1);
      expect(response.body.integrations[0].type).toBe('google');
      expect(response.body.integrations[0].isActive).toBe(true);
    });

    test('should disconnect integration', async () => {
      const response = await request(app)
        .delete(`/api/oauth/integrations/${integrationId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Integration disconnected successfully');

      // Verify integration is deleted
      const integration = await prisma.integration.findUnique({
        where: { id: integrationId }
      });
      expect(integration).toBeNull();
    });

    test('should test integration connection', async () => {
      const response = await request(app)
        .get('/api/oauth/integrations/google/test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.type).toBe('google');
      expect(response.body.status).toBe('connected');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid OAuth state', async () => {
      const response = await request(app)
        .get('/api/oauth/google/callback')
        .query({
          code: 'mock-auth-code',
          state: 'invalid-state'
        })
        .expect(302);

      expect(response.headers.location).toContain('error=oauth_failed');
    });

    test('should handle missing authorization code', async () => {
      const response = await request(app)
        .get('/api/oauth/google/callback')
        .query({
          state: 'test-state'
        })
        .expect(302);

      expect(response.headers.location).toContain('error=missing_parameters');
    });

    test('should handle OAuth provider error', async () => {
      const response = await request(app)
        .get('/api/oauth/google/callback')
        .query({
          error: 'access_denied',
          state: 'test-state'
        })
        .expect(302);

      expect(response.headers.location).toContain('error=access_denied');
    });

    test('should handle unauthorized access', async () => {
      const response = await request(app)
        .get('/api/oauth/google/init')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Integration Endpoints', () => {
    beforeEach(async () => {
      // Create a test integration
      await prisma.integration.create({
        data: {
          userId,
          type: 'google',
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
          tokenType: 'Bearer',
          expiresAt: new Date(Date.now() + 3600 * 1000),
          scope: 'calendar email',
          isActive: true
        }
      });
    });

    test('should get calendar events', async () => {
      const response = await request(app)
        .get('/api/integrations/calendar/events')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.events).toBeDefined();
    });

    test('should create calendar event', async () => {
      const eventData = {
        summary: 'Test Event',
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600 * 1000).toISOString(),
        description: 'Test event created by OAuth integration'
      };

      const response = await request(app)
        .post('/api/integrations/calendar/events')
        .set('Authorization', `Bearer ${authToken}`)
        .send(eventData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.event).toBeDefined();
    });

    test('should get emails', async () => {
      const response = await request(app)
        .get('/api/integrations/email/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.emails).toBeDefined();
    });

    test('should create task', async () => {
      // Create Airtable integration
      await prisma.integration.create({
        data: {
          userId,
          type: 'airtable',
          accessToken: 'mock-airtable-token',
          refreshToken: 'mock-airtable-refresh',
          tokenType: 'Bearer',
          expiresAt: new Date(Date.now() + 3600 * 1000),
          scope: 'data.records:read data.records:write',
          isActive: true
        }
      });

      const taskData = {
        title: 'Test Task',
        description: 'Test task created by OAuth integration',
        priority: 'High',
        category: 'Work'
      };

      const response = await request(app)
        .post('/api/integrations/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(taskData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.task).toBeDefined();
    });
  });
});

// Helper function to generate mock JWT token
function generateMockJWT(userId) {
  // In real tests, you'd use the actual JWT service
  return 'mock-jwt-token';
}

// Helper function to setup test environment
async function setupTestEnvironment() {
  // Setup test database, mock services, etc.
  console.log('Setting up test environment...');
}

// Helper function to cleanup test environment
async function cleanupTestEnvironment() {
  // Cleanup test database, mock services, etc.
  console.log('Cleaning up test environment...');
}

module.exports = {
  generateMockJWT,
  setupTestEnvironment,
  cleanupTestEnvironment
};