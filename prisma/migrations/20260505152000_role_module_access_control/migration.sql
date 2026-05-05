-- Role-based module access control tables

CREATE TABLE "UserModuleAccess" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "canView" BOOLEAN NOT NULL DEFAULT false,
  "canCreate" BOOLEAN NOT NULL DEFAULT false,
  "canEdit" BOOLEAN NOT NULL DEFAULT false,
  "canDelete" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserModuleAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoleModuleAccess" (
  "id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "canView" BOOLEAN NOT NULL DEFAULT false,
  "canCreate" BOOLEAN NOT NULL DEFAULT false,
  "canEdit" BOOLEAN NOT NULL DEFAULT false,
  "canDelete" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RoleModuleAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserModuleAccess_userId_moduleKey_key" ON "UserModuleAccess"("userId", "moduleKey");
CREATE INDEX "UserModuleAccess_userId_idx" ON "UserModuleAccess"("userId");
CREATE INDEX "UserModuleAccess_moduleKey_idx" ON "UserModuleAccess"("moduleKey");

CREATE UNIQUE INDEX "RoleModuleAccess_role_moduleKey_key" ON "RoleModuleAccess"("role", "moduleKey");
CREATE INDEX "RoleModuleAccess_role_idx" ON "RoleModuleAccess"("role");
CREATE INDEX "RoleModuleAccess_moduleKey_idx" ON "RoleModuleAccess"("moduleKey");

ALTER TABLE "UserModuleAccess"
  ADD CONSTRAINT "UserModuleAccess_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
