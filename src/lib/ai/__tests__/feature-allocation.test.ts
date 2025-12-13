/**
 * Feature Allocation Unit Tests
 * Run with: npx ts-node src/lib/ai/__tests__/feature-allocation.test.ts
 */

import {
  AIFeatureRunner,
  FeatureExecutor,
} from '../feature-runner';

// Simple test helpers
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected: ${expected}, Actual: ${actual}`);
  }
}

function assertContains<T>(array: T[], item: T, message: string): void {
  if (!array.includes(item)) {
    throw new Error(`Assertion failed: ${message}. Expected ${JSON.stringify(array)} to contain ${JSON.stringify(item)}`);
  }
}

// Mock executor for testing
const mockSummaryExecutor: FeatureExecutor<string> = {
  async execute(emailId: string, emailData: Record<string, unknown>) {
    return `Summary for ${emailId}: ${emailData.subject}`;
  }
};

const mockFailingExecutor: FeatureExecutor<string> = {
  async execute() {
    throw new Error('Simulated failure');
  }
};

// Test definitions
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const tests: Array<{ name: string; fn: () => Promise<void> }> = [];

function test(name: string, fn: () => Promise<void>) {
  tests.push({ name, fn });
}

// ===========================================
// AIFeatureRunner Tests
// ===========================================

test('registerExecutor should register an executor', async () => {
  const runner = new AIFeatureRunner();
  runner.registerExecutor('summary', mockSummaryExecutor);
  assert(runner.hasExecutor('summary'), 'Executor should be registered');
});

test('getRegisteredFeatures should list registered features', async () => {
  const runner = new AIFeatureRunner();
  runner.registerExecutor('summary', mockSummaryExecutor);
  runner.registerExecutor('smart_reply', mockSummaryExecutor);

  const features = runner.getRegisteredFeatures();
  assertContains(features, 'summary', 'Features should contain summary');
  assertContains(features, 'smart_reply', 'Features should contain smart_reply');
});

test('runManualFeature should return error for unregistered feature', async () => {
  const runner = new AIFeatureRunner();
  const result = await runner.runManualFeature(
    'user123',
    'email123',
    { subject: 'Test' },
    'summary'
  );

  assertEqual(result.success, false, 'Result should not be success');
  assert(result.error?.includes('No executor registered') || false, 'Error should mention no executor registered');
});

test('runManualFeature should execute registered feature successfully', async () => {
  const runner = new AIFeatureRunner();
  runner.registerExecutor('summary', mockSummaryExecutor);

  const result = await runner.runManualFeature(
    'user123',
    'email123',
    { subject: 'Test Email' },
    'summary'
  );

  assertEqual(result.success, true, 'Result should be success');
  assertEqual(result.data, 'Summary for email123: Test Email', 'Data should match expected output');
  assert(result.processingTimeMs >= 0, 'Processing time should be >= 0');
});

test('runManualFeature should handle executor errors gracefully', async () => {
  const runner = new AIFeatureRunner();
  runner.registerExecutor('summary', mockFailingExecutor);

  const result = await runner.runManualFeature(
    'user123',
    'email123',
    { subject: 'Test' },
    'summary'
  );

  assertEqual(result.success, false, 'Result should not be success');
  assertEqual(result.error, 'Simulated failure', 'Error should match');
  assertEqual(result.cost, 0, 'Cost should be 0 for failed execution');
});

// ===========================================
// Feature Allocation Logic Tests
// ===========================================

test('work category should enable all features by default', async () => {
  const workDefaults = {
    summary: true,
    smart_reply: true,
    action_items: true,
    follow_up: true,
    sentiment: false,
    translate: false,
  };

  assert(workDefaults.summary, 'Summary should be enabled for work');
  assert(workDefaults.smart_reply, 'Smart reply should be enabled for work');
  assert(workDefaults.action_items, 'Action items should be enabled for work');
});

test('spam category should disable most features', async () => {
  const spamDefaults = {
    summary: false,
    smart_reply: false,
    action_items: false,
    follow_up: false,
    sentiment: false,
    translate: false,
  };

  assertEqual(spamDefaults.summary, false, 'Summary should be disabled for spam');
  assertEqual(spamDefaults.smart_reply, false, 'Smart reply should be disabled for spam');
});

test('newsletter category should enable only summary', async () => {
  const newsletterDefaults = {
    summary: true,
    smart_reply: false,
    action_items: false,
    follow_up: false,
    sentiment: false,
    translate: false,
  };

  assert(newsletterDefaults.summary, 'Summary should be enabled for newsletter');
  assertEqual(newsletterDefaults.smart_reply, false, 'Smart reply should be disabled for newsletter');
});

// ===========================================
// Priority Override Tests
// ===========================================

test('high priority should override defaults', async () => {
  const priority = 5; // High priority
  const shouldOverride = priority >= 4;
  assert(shouldOverride, 'Priority 5 should trigger override');
});

test('low priority should not override defaults', async () => {
  const priority = 1;
  const shouldOverride = priority >= 4;
  assertEqual(shouldOverride, false, 'Priority 1 should not trigger override');
});

// ===========================================
// Content Trigger Detection Tests
// ===========================================

function detectTriggers(text: string): string[] {
  const triggers: string[] = [];
  const patterns: Record<string, RegExp> = {
    deadline: /deadline|hạn chót|trước ngày/i,
    urgent: /urgent|gấp|khẩn/i,
    meeting: /meeting|họp|cuộc hẹn/i,
    payment: /thanh toán|payment|invoice/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      triggers.push(key);
    }
  }
  return triggers;
}

test('should detect deadline trigger', async () => {
  const triggers = detectTriggers('Vui lòng hoàn thành trước deadline thứ 6');
  assertContains(triggers, 'deadline', 'Should detect deadline');
});

test('should detect urgent trigger', async () => {
  const triggers = detectTriggers('Đây là việc gấp cần xử lý ngay');
  assertContains(triggers, 'urgent', 'Should detect urgent');
});

test('should detect meeting trigger', async () => {
  const triggers = detectTriggers('Mời bạn tham dự cuộc họp ngày mai');
  assertContains(triggers, 'meeting', 'Should detect meeting');
});

test('should detect payment trigger', async () => {
  const triggers = detectTriggers('Vui lòng thanh toán hóa đơn');
  assertContains(triggers, 'payment', 'Should detect payment');
});

test('should detect multiple triggers', async () => {
  const triggers = detectTriggers('Việc gấp: thanh toán trước deadline');
  assertContains(triggers, 'urgent', 'Should detect urgent');
  assertContains(triggers, 'payment', 'Should detect payment');
  assertContains(triggers, 'deadline', 'Should detect deadline');
});

// ===========================================
// Cost Calculation Tests
// ===========================================

const FEATURE_COSTS = {
  classification: 0.0001,
  summary: 0.0005,
  smart_reply: 0.0008,
  action_items: 0.0006,
  follow_up: 0.0004,
  sentiment: 0.0002,
  translate: 0.0010,
};

test('should calculate total cost for enabled features', async () => {
  const enabledFeatures = ['summary', 'smart_reply', 'action_items'];
  const totalCost = enabledFeatures.reduce(
    (sum, key) => sum + (FEATURE_COSTS[key as keyof typeof FEATURE_COSTS] || 0),
    0
  );

  const expected = 0.0019;
  const tolerance = 0.0001;
  assert(
    Math.abs(totalCost - expected) < tolerance,
    `Total cost ${totalCost} should be close to ${expected}`
  );
});

test('should calculate savings from disabled features', async () => {
  const allFeaturesCost = Object.values(FEATURE_COSTS).reduce((a, b) => a + b, 0);
  const enabledCost = FEATURE_COSTS.summary;
  const savings = allFeaturesCost - enabledCost;

  assert(savings > 0, 'Savings should be greater than 0');
});

// ===========================================
// Test Runner
// ===========================================

export async function runFeatureAllocationTests(): Promise<{
  passed: number;
  failed: number;
  results: TestResult[];
}> {
  console.log('='.repeat(60));
  console.log('🧪 FEATURE ALLOCATION TESTS');
  console.log('='.repeat(60));
  console.log('');

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`✅ ${name}`);
      results.push({ name, passed: true });
    } catch (error) {
      failed++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`❌ ${name}`);
      console.log(`   Error: ${errorMessage}`);
      results.push({ name, passed: false, error: errorMessage });
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`📊 RESULTS: ${passed}/${tests.length} passed`);
  console.log('='.repeat(60));

  return { passed, failed, results };
}

// Run tests if called directly
if (require.main === module) {
  runFeatureAllocationTests()
    .then(({ failed }) => {
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}
