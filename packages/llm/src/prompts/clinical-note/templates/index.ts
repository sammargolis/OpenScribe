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
const DEFAULT_TEMPLATE = `# History and Physical

## Chief Complaint
{{chief_complaint_in_patient_words}}

## History of Present Illness
{{hpi_narrative}}

## Review of Systems
{{ros_bullet_points}}

## Past Medical History
{{pmh}}

## Medications
{{medications_bullet_points}}
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

/**
 * Identifier for the template selected by the user.
 * "default" and "soap" are presets resolved through the registry above.
 * "custom" resolves to user-authored markdown.
 */
export type NoteTemplateId = 'default' | 'soap' | 'custom';

export interface ResolveTemplateParams {
  /** Selected template id. Unknown values fall back to the default preset. */
  templateId?: string;
  /** User-authored markdown, only used when templateId is "custom". */
  customTemplate?: string;
}

/** A usable custom template must contain at least one markdown ATX heading. */
const MARKDOWN_HEADING_PATTERN = /^ {0,3}#{1,6} +\S/m;

/**
 * Validate a user-authored markdown template.
 * Requires non-empty content with at least one markdown heading (#, ##, ###).
 */
export function isValidCustomTemplate(template?: string): boolean {
  if (typeof template !== 'string') {
    return false;
  }

  const trimmed = template.trim();
  if (trimmed.length === 0) {
    return false;
  }

  return MARKDOWN_HEADING_PATTERN.test(trimmed);
}

/**
 * Resolve a template selection into the actual markdown passed to the prompt.
 *
 * - Preset ids ("default", "soap") resolve through the template registry.
 * - "custom" resolves to the user markdown when valid.
 * - Empty/invalid custom markdown or an unknown id falls back to the default
 *   template deterministically, with a warning. Never throws.
 */
export function resolveTemplate(params: ResolveTemplateParams = {}): string {
  const { templateId, customTemplate } = params;

  if (templateId === 'custom') {
    if (isValidCustomTemplate(customTemplate)) {
      return customTemplate!.trim();
    }

    console.warn(
      'Custom note template is empty or has no markdown heading, using default template'
    );
    return DEFAULT_TEMPLATE;
  }

  return getTemplate(templateId);
}
