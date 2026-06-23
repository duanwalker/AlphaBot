import 'dotenv/config';
import { TableClient } from '@azure/data-tables';

const USER_PROFILES_TABLE = 'userProfiles';

let profileTableClient;

function getConnectionString() {
  return (
    String(process.env.AZURE_STORAGE_CONNECTION_STRING || '').trim() ||
    process.env.AZURE_TABLE_CONNECTION_STRING ||
    process.env.AzureWebJobsStorage ||
    ''
  );
}

function getProfileTableClient() {
  if (!profileTableClient) {
    const connectionString = getConnectionString();
    if (!connectionString) {
      throw new Error(
        'Missing Azure Table Storage connection string. Set AZURE_STORAGE_CONNECTION_STRING.'
      );
    }
    profileTableClient = TableClient.fromConnectionString(
      connectionString,
      USER_PROFILES_TABLE
    );
  }
  return profileTableClient;
}

async function ensureTable() {
  try {
    await getProfileTableClient().createTable();
  } catch (err) {
    if (err?.statusCode !== 409) throw err;
  }
}

export async function getUserProfile(userId, tenantId = 'alpha-dev') {
  await ensureTable();
  try {
    const entity = await getProfileTableClient().getEntity(tenantId, userId);
    return {
      userId:                entity.rowKey,
      tenantId:              entity.partitionKey,
      onboardingCompleted:   entity.onboardingCompleted   || false,
      onboardingSkipped:     entity.onboardingSkipped     || false,
      onboardingCompletedAt: entity.onboardingCompletedAt || null,
      onboardingSkippedAt:   entity.onboardingSkippedAt   || null,
      questionnaire: {
        portfolioSize:     entity.portfolioSize     || null,
        primaryGoal:       entity.primaryGoal       || null,
        timeHorizon:       entity.timeHorizon       || null,
        riskTolerance:     entity.riskTolerance     || null,
        timeCommitment:    entity.timeCommitment    || null,
        accountType:       entity.accountType       || null,
        optionsExperience: entity.optionsExperience || null,
      },
      strategyProfile: {
        recommendedStrategies: JSON.parse(entity.recommendedStrategies || '[]'),
        riskLevel:      entity.riskLevel             || null,
        primaryGoal:    entity.primaryGoalSummary    || null,
        timeHorizon:    entity.timeHorizonSummary    || null,
        claudeAnalysis: entity.claudeAnalysis        || null,
        generatedAt:    entity.profileGeneratedAt    || null,
      },
      activeStrategies: JSON.parse(entity.activeStrategies || '[]'),
    };
  } catch (err) {
    if (err?.statusCode === 404) return null;
    throw err;
  }
}

export async function saveUserProfile(userId, tenantId = 'alpha-dev', profileData) {
  await ensureTable();
  const entity = {
    partitionKey: tenantId,
    rowKey:       userId,

    onboardingCompleted:   profileData.onboardingCompleted   || false,
    onboardingSkipped:     profileData.onboardingSkipped     || false,
    onboardingCompletedAt: profileData.onboardingCompletedAt || null,
    onboardingSkippedAt:   profileData.onboardingSkippedAt   || null,

    portfolioSize:     profileData.questionnaire?.portfolioSize     || null,
    primaryGoal:       profileData.questionnaire?.primaryGoal       || null,
    timeHorizon:       profileData.questionnaire?.timeHorizon       || null,
    riskTolerance:     profileData.questionnaire?.riskTolerance     || null,
    timeCommitment:    profileData.questionnaire?.timeCommitment    || null,
    accountType:       profileData.questionnaire?.accountType       || null,
    optionsExperience: profileData.questionnaire?.optionsExperience || null,

    recommendedStrategies: JSON.stringify(
      profileData.strategyProfile?.recommendedStrategies || []
    ),
    riskLevel:          profileData.strategyProfile?.riskLevel      || null,
    primaryGoalSummary: profileData.strategyProfile?.primaryGoal    || null,
    timeHorizonSummary: profileData.strategyProfile?.timeHorizon    || null,
    claudeAnalysis:     profileData.strategyProfile?.claudeAnalysis || null,
    profileGeneratedAt: profileData.strategyProfile?.generatedAt    || null,

    activeStrategies: JSON.stringify(profileData.activeStrategies || []),
  };
  await getProfileTableClient().upsertEntity(entity, 'Merge');
  return entity;
}

export async function updateActiveStrategies(userId, tenantId = 'alpha-dev', activeStrategies) {
  await ensureTable();
  await getProfileTableClient().upsertEntity({
    partitionKey: tenantId,
    rowKey: userId,
    activeStrategies: JSON.stringify(activeStrategies || []),
  }, 'Merge');
}

export async function markOnboardingSkipped(userId, tenantId = 'alpha-dev') {
  await ensureTable();
  await getProfileTableClient().upsertEntity({
    partitionKey:        tenantId,
    rowKey:              userId,
    onboardingSkipped:   true,
    onboardingSkippedAt: new Date().toISOString(),
  }, 'Merge');
}

export async function markOnboardingCompleted(userId, tenantId = 'alpha-dev') {
  await ensureTable();
  await getProfileTableClient().upsertEntity({
    partitionKey:          tenantId,
    rowKey:                userId,
    onboardingCompleted:   true,
    onboardingCompletedAt: new Date().toISOString(),
    onboardingSkipped:     false,
  }, 'Merge');
}

export async function deleteUserProfile(userId, tenantId = 'alpha-dev') {
  await ensureTable();
  try {
    await getProfileTableClient().deleteEntity(tenantId, userId);
  } catch (err) {
    if (err?.statusCode !== 404) throw err;
  }
}
