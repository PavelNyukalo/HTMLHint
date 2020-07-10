import HTMLParser from './htmlparser'
import Reporter, { ReportMessageCallback } from './reporter'
import * as HTMLRules from './rules'
import {
  Configuration,
  Hint,
  isRuleSeverity,
  Rule,
  Ruleset,
  RuleSeverity,
} from './types'

export interface FormatOptions {
  colors?: boolean
  indent?: number
}

const HTMLHINT_RECOMMENDED = 'htmlhint:recommended'
const HTMLHINT_LEGACY = 'htmlhint:legacy'

const DEFAULT_RULESETS: Record<string, Ruleset> = {
  [HTMLHINT_RECOMMENDED]: {
    // TODO: Define recommended rules
  },
  [HTMLHINT_LEGACY]: {
    'attr-lowercase': 'error',
    'attr-no-duplication': 'error',
    'attr-value-double-quotes': 'error',
    'doctype-first': 'error',
    'id-unique': 'error',
    'spec-char-escape': 'error',
    'src-not-empty': 'error',
    'tag-pair': 'error',
    'tagname-lowercase': 'error',
    'title-require': 'error',
  },
}

class HTMLHintCore {
  public rules: { [id: string]: Rule } = {}

  public addRule(rule: Rule) {
    this.rules[rule.id] = rule
  }

  public verify(
    html: string,
    config: Configuration = { extends: [HTMLHINT_LEGACY] }
  ) {
    let ruleset: Ruleset = {}

    // Iterate through extensions and merge rulesets into ruleset
    for (const extend of config.extends ?? []) {
      if (typeof extend === 'string') {
        const extendRuleset = DEFAULT_RULESETS[extend] ?? {}
        ruleset = { ...ruleset, ...extendRuleset }
      }
    }

    // Apply self-configured rules
    ruleset = { ...ruleset, ...(config.rules ?? {}) }

    // If no rules have been configured, return immediately
    if (Object.keys(ruleset).length === 0) {
      // console.log('Please configure some HTMLHint rules')
      return []
    }

    // parse inline ruleset
    html = html.replace(
      /^\s*<!--\s*htmlhint\s+([^\r\n]+?)\s*-->/i,
      (all, strRuleset: string) => {
        // For example:
        // all is '<!-- htmlhint alt-require:warn-->'
        // strRuleset is 'alt-require:warn'
        strRuleset.replace(
          /(?:^|,)\s*([^:,]+)\s*(?:\:\s*([^,\s]+))?/g,
          (all, ruleId: string, value: string | undefined) => {
            // For example:
            // all is 'alt-require:warn'
            // ruleId is 'alt-require'
            // value is 'warn'

            ruleset[ruleId] = isRuleSeverity(value) ? value : 'error'

            return ''
          }
        )

        return ''
      }
    )

    const parser = new HTMLParser()
    const reporter = new Reporter(html, ruleset)

    const rules = this.rules
    let rule: Rule

    for (const id in ruleset) {
      rule = rules[id]
      const ruleConfig = ruleset[id]
      const ruleSeverity: RuleSeverity = Array.isArray(ruleConfig)
        ? ruleConfig[0]
        : ruleConfig
      if (rule !== undefined && ruleSeverity !== 'off') {
        const reportMessageCallback: ReportMessageCallback = reporter[
          ruleSeverity
        ].bind(reporter)
        rule.init(
          parser,
          reportMessageCallback,
          Array.isArray(ruleConfig) ? ruleConfig[1] : undefined
        )
      }
    }

    parser.parse(html)

    return reporter.messages
  }

  public format(arrMessages: Hint[], options: FormatOptions = {}) {
    const arrLogs: string[] = []
    const colors = {
      white: '',
      grey: '',
      red: '',
      reset: '',
    }

    if (options.colors) {
      colors.white = '\x1b[37m'
      colors.grey = '\x1b[90m'
      colors.red = '\x1b[31m'
      colors.reset = '\x1b[39m'
    }

    const indent = options.indent || 0

    arrMessages.forEach((hint) => {
      const leftWindow = 40
      const rightWindow = leftWindow + 20
      let evidence = hint.evidence
      const line = hint.line
      const col = hint.col
      const evidenceCount = evidence.length
      let leftCol = col > leftWindow + 1 ? col - leftWindow : 1
      let rightCol =
        evidence.length > col + rightWindow ? col + rightWindow : evidenceCount

      if (col < leftWindow + 1) {
        rightCol += leftWindow - col + 1
      }

      evidence = evidence.replace(/\t/g, ' ').substring(leftCol - 1, rightCol)

      // add ...
      if (leftCol > 1) {
        evidence = `...${evidence}`
        leftCol -= 3
      }
      if (rightCol < evidenceCount) {
        evidence += '...'
      }

      // show evidence
      arrLogs.push(
        `${colors.white + repeatStr(indent)}L${line} |${
          colors.grey
        }${evidence}${colors.reset}`
      )

      // show pointer & message
      let pointCol = col - leftCol
      // add double byte character
      // eslint-disable-next-line no-control-regex
      const match = evidence.substring(0, pointCol).match(/[^\u0000-\u00ff]/g)
      if (match !== null) {
        pointCol += match.length
      }

      arrLogs.push(
        `${
          colors.white +
          repeatStr(indent) +
          repeatStr(String(line).length + 3 + pointCol)
        }^ ${colors.red}${hint.message} (${hint.rule.id})${colors.reset}`
      )
    })

    return arrLogs
  }
}

// repeat string
function repeatStr(n: number, str?: string) {
  return new Array(n + 1).join(str || ' ')
}

export const HTMLHint = new HTMLHintCore()

Object.keys(HTMLRules).forEach((key) => {
  // TODO: need a fix
  // @ts-expect-error
  HTMLHint.addRule(HTMLRules[key])
})

export { HTMLRules, Reporter, HTMLParser }
