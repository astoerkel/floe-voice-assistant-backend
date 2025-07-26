const { PrismaClient } = require("@prisma/client");

async function debugTokens() {
  let prisma;
  try {
    prisma = new PrismaClient();
    
    // Find all users
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true }
    });
    
    console.log("=== ALL USERS ===");
    users.forEach(user => {
      console.log(`${user.id}: ${user.email} (${user.name})`);
    });
    
    // Check integrations for all users
    console.log("\n=== ALL INTEGRATIONS ===");
    const integrations = await prisma.integration.findMany({
      select: { 
        userId: true,
        type: true, 
        isActive: true, 
        accessToken: true, 
        refreshToken: true, 
        expiresAt: true,
        createdAt: true
      }
    });
    
    integrations.forEach(int => {
      console.log(`User: ${int.userId}`);
      console.log(`  Type: ${int.type}, Active: ${int.isActive}`);
      console.log(`  HasAccess: ${!!int.accessToken}, HasRefresh: ${!!int.refreshToken}`);
      console.log(`  Expires: ${int.expiresAt}, Created: ${int.createdAt}`);
      console.log("---");
    });
    
    // Also check for any user with the email from the logs
    const cogneticaUser = await prisma.user.findFirst({
      where: { email: "hello@cognetica.de" },
      include: {
        integrations: {
          select: {
            type: true,
            isActive: true,
            accessToken: true,
            refreshToken: true,
            expiresAt: true
          }
        }
      }
    });
    
    if (cogneticaUser) {
      console.log("\n=== COGNETICA USER ===");
      console.log(`ID: ${cogneticaUser.id}`);
      console.log(`Email: ${cogneticaUser.email}`);
      console.log(`Name: ${cogneticaUser.name}`);
      console.log("Integrations:");
      cogneticaUser.integrations.forEach(int => {
        console.log(`  ${int.type}: active=${int.isActive}, tokens=${!!int.accessToken}/${!!int.refreshToken}`);
      });
    }
    
  } catch (error) {
    console.error("Database error:", error.message);
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

debugTokens();