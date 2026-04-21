export function getUserScope(userOrId, tenantId = "alpha-dev") {
  if (typeof userOrId === "object" && userOrId !== null) {
    return {
      userId: userOrId.id || userOrId.userId || "dev-user",
      tenantId: userOrId.tenantId || tenantId,
    };
  }

  return {
    userId: userOrId || "dev-user",
    tenantId,
  };
}

export function attachEntityScope(entity, userOrId, tenantId = "alpha-dev") {
  if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
    return entity;
  }

  return {
    ...entity,
    ...getUserScope(userOrId, tenantId),
  };
}

export function attachEntityScopeList(items, userOrId, tenantId = "alpha-dev") {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => attachEntityScope(item, userOrId, tenantId));
}