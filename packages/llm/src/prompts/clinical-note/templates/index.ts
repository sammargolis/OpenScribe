/**
 * Clinical note markdown templates
 * 
 * Templates define the structure and formatting of clinical notes.
 * Contributors can modify these templates to customize note formats
 * without dealing with JSON schemas or code changes.
 */

/**
 * Default clinical note template
 */
const DEFAULT_TEMPLATE = `# Clinical Note

## Chief Complaint
{{chief_complaint}}

## History of Present Illness
{{hpi}}

## Review of Systems
{{ros}}

## Physical Exam
{{physical_exam}}

## Assessment
{{assessment}}

## Plan
{{plan}}
`;

/**
 * SOAP note template
 */
const SOAP_TEMPLATE = `# SOAP Note

## Subjective
### Chief Complaint
{{chief_complaint}}

### History of Present Illness
{{hpi}}

### Review of Systems
{{ros}}

## Objective
### Physical Examination
{{physical_exam}}

## Assessment
{{assessment}}

## Plan
{{plan}}
`;

/**
 * Template registry
 */
const TEMPLATES: Record<string, string> = {
  default: DEFAULT_TEMPLATE,
  soap: SOAP_TEMPLATE,
};

/**
 * Get the default clinical note template
 */
export function getDefaultTemplate(): string {
  return DEFAULT_TEMPLATE;
}

/**
 * Get SOAP note template
 */
export function getSoapTemplate(): string {
  return SOAP_TEMPLATE;
}

/**
 * List available template names
 */
export function getAvailableTemplates(): string[] {
  return Object.keys(TEMPLATES);
}

/**
 * Get template by name with fallback to default
 */
export function getTemplate(name?: string): string {
  if (!name || name === 'default') {
    return DEFAULT_TEMPLATE;
  }
  
  const template = TEMPLATES[name];
  if (template) {
    return template;
  }
  
  console.warn(`Template "${name}" not found, using default`);
  return DEFAULT_TEMPLATE;
}

