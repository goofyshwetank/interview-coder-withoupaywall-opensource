export interface Solution {
  initial_thoughts: string[]
  thought_steps: string[]
  description: string
  code: string
}

export interface SolutionsResponse {
  [key: string]: Solution
}

export interface ProblemStatementData {
  problem_statement: string
  input_format: {
    description: string
    parameters: any[]
  }
  output_format: {
    description: string
    type: string
    subtype: string
  }
  complexity: {
    time: string
    space: string
  }
  test_cases: any[]
  validation_type: string
  difficulty: string
}

// New interfaces for enhanced debugging
export interface PreviousSolution {
  id: string
  code: string
  timestamp: number
  success: boolean
  failed_test_cases?: string[]
  error_message?: string
  language: string
  problem_statement: string
}

export interface TestCaseFailure {
  test_case_id: string
  expected: any
  actual: any
  input: any
  error_type: 'logic' | 'runtime' | 'timeout' | 'memory'
  error_message?: string
}

export interface DebugContext {
  current_code: string
  failed_test_cases: TestCaseFailure[]
  previous_solutions: PreviousSolution[]
  recent_changes?: string[]
  screenshot_analysis?: string
}

export interface EnhancedDebugResponse {
  debug_analysis: string
  code_comparison?: string
  specific_test_fixes: string[]
  suggested_approach: string
  previous_solution_reference?: string
  step_by_step_fix: string[]
}
