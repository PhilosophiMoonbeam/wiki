import { validateHeaderValue } from 'node:http'
import type { NextFunction, Request, Response } from 'express'

interface SecurityWikiContext {
  config: {
    security: {
      securityIframe: boolean
      securityReferrerPolicy: boolean
      securityHSTS: boolean
      securityHSTSDuration: number
      securityHSTSIncludeSubDomains?: boolean
      securityOpenRedirect: boolean
      securityCSP: boolean
      securityCSPReportOnly?: boolean
      securityCSPDirectives: string
    }
  }
}

const wiki = WIKI as unknown as SecurityWikiContext

export default function securityMiddleware(req: Request, res: Response, next: NextFunction): void {
  // -> Disable X-Powered-By
  req.app.disable('x-powered-by')

  // -> Disable Frame Embedding
  if (wiki.config.security.securityIframe) {
    res.set('X-Frame-Options', 'deny')
  }

  // -> Re-enable XSS Filter if disabled
  res.set('X-XSS-Protection', '1; mode=block')

  // -> Disable MIME-sniffing
  res.set('X-Content-Type-Options', 'nosniff')

  // -> Disable IE Compatibility Mode
  res.set('X-UA-Compatible', 'IE=edge')

  // -> Disables referrer header when navigating to a different origin
  if (wiki.config.security.securityReferrerPolicy) {
    res.set('Referrer-Policy', 'same-origin')
  }

  // -> Enforce HSTS
  if (wiki.config.security.securityHSTS) {
    res.set(
      'Strict-Transport-Security',
      `max-age=${wiki.config.security.securityHSTSDuration}${wiki.config.security.securityHSTSIncludeSubDomains === false ? '' : '; includeSubDomains'}`
    )
  }

  // -> Enforce Content Security Policy
  if (wiki.config.security.securityCSP || wiki.config.security.securityCSPReportOnly) {
    const directives = wiki.config.security.securityCSPDirectives
    let validDirectives = true
    try {
      validateHeaderValue('Content-Security-Policy', directives)
    } catch {
      validDirectives = false
    }
    if (validDirectives) {
      res.set(wiki.config.security.securityCSP ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', directives)
    }
  }

  // -> Prevent Open Redirect from user provided URL
  if (wiki.config.security.securityOpenRedirect) {
    // Strips out all repeating / character in the provided URL
    req.url = req.url.replace(/(\/)(?=\/*\1)/g, '')
  }

  next()
}
