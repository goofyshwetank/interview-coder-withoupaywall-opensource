import { PreviousSolution, TestCaseFailure, DebugContext, EnhancedDebugResponse } from '../types/solutions';

export class DebugEnhancementService {
  private static instance: DebugEnhancementService;
  private previousSolutions: PreviousSolution[] = [];
  private maxStoredSolutions = 10; // Keep last 10 solutions for context

  static getInstance(): DebugEnhancementService {
    if (!DebugEnhancementService.instance) {
      DebugEnhancementService.instance = new DebugEnhancementService();
    }
    return DebugEnhancementService.instance;
  }

  /**
   * Store a solution attempt with its results
   */
  storeSolutionAttempt(solution: Omit<PreviousSolution, 'id' | 'timestamp'>): void {
    const newSolution: PreviousSolution = {
      ...solution,
      id: Date.now().toString(),
      timestamp: Date.now()
    };

    this.previousSolutions.unshift(newSolution);
    
    // Keep only the most recent solutions
    if (this.previousSolutions.length > this.maxStoredSolutions) {
      this.previousSolutions = this.previousSolutions.slice(0, this.maxStoredSolutions);
    }

    // Store in localStorage for persistence
    this.saveToPersistentStorage();
  }

  /**
   * Get previous solutions for the same problem
   */
  getPreviousSolutions(problemStatement: string, limit: number = 5): PreviousSolution[] {
    return this.previousSolutions
      .filter(sol => sol.problem_statement === problemStatement)
      .slice(0, limit);
  }

  /**
   * Get the most recent working solution
   */
  getLastWorkingSolution(problemStatement: string): PreviousSolution | null {
    return this.previousSolutions
      .find(sol => sol.problem_statement === problemStatement && sol.success) || null;
  }

  /**
   * Analyze screenshots to extract test case failures
   */
  analyzeTestCaseFailures(screenshotAnalysis: string): TestCaseFailure[] {
    const failures: TestCaseFailure[] = [];
    
    // Parse common test failure patterns from screenshot analysis
    const testCasePattern = /test.*case.*(\d+).*fail/gi;
    const expectedPattern = /expected[:\s]+(.+?)[\s,\n]/gi;
    const actualPattern = /actual[:\s]+(.+?)[\s,\n]/gi;
    const errorPattern = /(runtime error|timeout|memory|assertion|null pointer)/gi;

    let match;
    let testCaseIndex = 0;

    // Extract test case failures
    while ((match = testCasePattern.exec(screenshotAnalysis)) !== null) {
      const testId = match[1] || testCaseIndex.toString();
      
      // Find expected and actual values near this test case
      const contextStart = Math.max(0, match.index - 200);
      const contextEnd = Math.min(screenshotAnalysis.length, match.index + 200);
      const context = screenshotAnalysis.slice(contextStart, contextEnd);
      
      const expectedMatch = expectedPattern.exec(context);
      const actualMatch = actualPattern.exec(context);
      const errorMatch = errorPattern.exec(context);
      
      const failure: TestCaseFailure = {
        test_case_id: testId,
        expected: expectedMatch ? expectedMatch[1].trim() : 'Unknown',
        actual: actualMatch ? actualMatch[1].trim() : 'Unknown',
        input: 'From screenshot', // Could be enhanced to parse input
        error_type: this.categorizeError(errorMatch ? errorMatch[1] : ''),
        error_message: errorMatch ? errorMatch[1] : undefined
      };
      
      failures.push(failure);
      testCaseIndex++;
    }

    return failures.length > 0 ? failures : this.extractGenericFailures(screenshotAnalysis);
  }

  /**
   * Generate enhanced debug context including previous solutions
   */
  generateDebugContext(
    currentCode: string, 
    problemStatement: string, 
    screenshotAnalysis: string
  ): DebugContext {
    const previousSolutions = this.getPreviousSolutions(problemStatement);
    const failedTestCases = this.analyzeTestCaseFailures(screenshotAnalysis);
    
    return {
      current_code: currentCode,
      failed_test_cases: failedTestCases,
      previous_solutions: previousSolutions,
      recent_changes: this.extractRecentChanges(previousSolutions, currentCode),
      screenshot_analysis: screenshotAnalysis
    };
  }

  /**
   * Generate an enhanced debug prompt that includes previous solution context
   */
  generateEnhancedDebugPrompt(
    problemStatement: string,
    language: string,
    debugContext: DebugContext
  ): string {
    const { previous_solutions, failed_test_cases, current_code } = debugContext;
    const lastWorkingSolution = previous_solutions.find(s => s.success);
    
    let prompt = `You are a coding interview assistant helping debug and improve solutions. I need detailed help with debugging my current solution that has failing test cases.

PROBLEM: "${problemStatement}"
LANGUAGE: ${language}

CURRENT CODE:
\`\`\`${language}
${current_code}
\`\`\`

`;

    // Add previous solution context if available
    if (lastWorkingSolution) {
      prompt += `PREVIOUS WORKING SOLUTION (for reference):
\`\`\`${language}
${lastWorkingSolution.code}
\`\`\`

`;
    }

    // Add failed test case analysis
    if (failed_test_cases.length > 0) {
      prompt += `FAILED TEST CASES:
${failed_test_cases.map((failure, index) => 
  `${index + 1}. Test Case ${failure.test_case_id}:
   - Expected: ${failure.expected}
   - Actual: ${failure.actual}
   - Error Type: ${failure.error_type}
   ${failure.error_message ? `- Error: ${failure.error_message}` : ''}`
).join('\n')}

`;
    }

    // Add previous attempt context
    if (previous_solutions.length > 0) {
      const recentFailures = previous_solutions.filter(s => !s.success).slice(0, 2);
      if (recentFailures.length > 0) {
        prompt += `RECENT FAILED ATTEMPTS:
${recentFailures.map((attempt, index) => 
  `${index + 1}. Previous attempt failed with: ${attempt.error_message || 'Unknown error'}
   Failed test cases: ${attempt.failed_test_cases?.join(', ') || 'Not specified'}`
).join('\n')}

`;
      }
    }

    prompt += `YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE:

### Issues Identified
- List each specific issue found in the current code compared to requirements and previous working solution

### Code Comparison Analysis
${lastWorkingSolution ? '- Compare current code with the previous working solution and highlight key differences' : '- Analyze the current code structure and logic flow'}

### Specific Test Case Fixes
- For each failed test case, provide specific fixes needed
- Reference the exact test case numbers and expected vs actual outputs

### Step-by-Step Fix Plan
1. Numbered steps to fix the code
2. Each step should be specific and actionable
3. Include code snippets where helpful

### Improved Solution
\`\`\`${language}
// Provide the corrected code here
\`\`\`

### Why This Fix Works
- Explain how the fixes address each failed test case
- Reference how this aligns with the previous working approach (if applicable)

Focus especially on the failed test cases and provide concrete, actionable debugging advice.`;

    return prompt;
  }

  private categorizeError(errorText: string): 'logic' | 'runtime' | 'timeout' | 'memory' {
    const lowerError = errorText.toLowerCase();
    if (lowerError.includes('timeout')) return 'timeout';
    if (lowerError.includes('memory') || lowerError.includes('limit')) return 'memory';
    if (lowerError.includes('runtime') || lowerError.includes('null') || lowerError.includes('exception')) return 'runtime';
    return 'logic';
  }

  private extractGenericFailures(analysis: string): TestCaseFailure[] {
    // If no specific test cases found, create generic failure entry
    if (analysis.toLowerCase().includes('fail') || analysis.toLowerCase().includes('error')) {
      return [{
        test_case_id: '1',
        expected: 'Correct output',
        actual: 'Incorrect output',
        input: 'From screenshot analysis',
        error_type: 'logic',
        error_message: 'Test case failure detected in screenshot'
      }];
    }
    return [];
  }

  private extractRecentChanges(previousSolutions: PreviousSolution[], currentCode: string): string[] {
    if (previousSolutions.length === 0) return [];
    
    const lastSolution = previousSolutions[0];
    const changes: string[] = [];
    
    // Simple diff analysis (could be enhanced with proper diff library)
    const lastLines = lastSolution.code.split('\n');
    const currentLines = currentCode.split('\n');
    
    if (currentLines.length !== lastLines.length) {
      changes.push(`Code length changed from ${lastLines.length} to ${currentLines.length} lines`);
    }
    
    // Check for major structural changes
    const lastFunctions = this.extractFunctions(lastSolution.code);
    const currentFunctions = this.extractFunctions(currentCode);
    
    if (lastFunctions.length !== currentFunctions.length) {
      changes.push(`Number of functions changed from ${lastFunctions.length} to ${currentFunctions.length}`);
    }
    
    return changes;
  }

  private extractFunctions(code: string): string[] {
    // Simple function extraction (could be enhanced for different languages)
    const functionPattern = /(?:def|function|public|private|protected)\s+(\w+)/g;
    const functions: string[] = [];
    let match;
    
    while ((match = functionPattern.exec(code)) !== null) {
      functions.push(match[1]);
    }
    
    return functions;
  }

  private saveToPersistentStorage(): void {
    try {
      localStorage.setItem('debug_previous_solutions', JSON.stringify(this.previousSolutions));
    } catch (error) {
      console.warn('Failed to save previous solutions to storage:', error);
    }
  }

  private loadFromPersistentStorage(): void {
    try {
      const stored = localStorage.getItem('debug_previous_solutions');
      if (stored) {
        this.previousSolutions = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load previous solutions from storage:', error);
      this.previousSolutions = [];
    }
  }

  /**
   * Initialize the service and load previous solutions
   */
  initialize(): void {
    this.loadFromPersistentStorage();
  }

  /**
   * Clear all stored solutions (for testing or reset)
   */
  clearHistory(): void {
    this.previousSolutions = [];
    localStorage.removeItem('debug_previous_solutions');
  }
}