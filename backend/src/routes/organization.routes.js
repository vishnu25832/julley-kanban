
const express = require("express");

const { authenticate } = require("../middleware/auth.middleware");

const {
  getOrganizations,
  createOrganization,
  getTenants,
  createTenant,
  getTenant,
} = require("../controllers/organization.controller");

const router = express.Router();

router.use(authenticate);

router.get("/organizations", getOrganizations);
router.post("/organizations", createOrganization);

router.get(
  "/organizations/:organizationId/tenants",
  getTenants
);

router.post(
  "/organizations/:organizationId/tenants",
  createTenant
);

router.get("/tenants/:tenantId", getTenant);

module.exports = router;
