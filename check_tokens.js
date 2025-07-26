const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkTokens() {
  try {
    const user = await prisma.user.findFirst({ where: { id: "dev-user-123" } });
    console.log("User found:", user ? "YES" : "NO");
    if (user) {
      console.log("User details:", { id: user.id, email: user.email, name: user.name });
    }
    
    const integrations = await prisma.integration.findMany({ 
      where: { userId: "dev-user-123" },
      select: { type: true, isActive: true, accessToken: true, refreshToken: true, expiresAt: true }
    });
    console.log("Integrations for dev-user-123:", integrations.length);
    integrations.forEach(int => {
      console.log("Type:", int.type, "Active:", int.isActive, "HasAccess:", !!int.accessToken, "HasRefresh:", !!int.refreshToken, "Expires:", int.expiresAt);
    });
    
    await prisma.$disconnect();
  } catch (error) {
    console.error("Database error:", error.message);
  }
}

checkTokens();