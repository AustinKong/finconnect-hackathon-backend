export interface AuthorizationRequest {
  cardNumber: string;
  amount: number;
  currency: string;
  merchantId: string;
  metadata?: any;
}

export interface AuthorizationResponse {
  success: boolean;
  authorizationId: string;
  amount: number;
  currency: string;
  status: string;
  message?: string;
  timestamp: string;
}

export interface CaptureRequest {
  authorizationId: string;
  amount?: number; // Optional partial capture
}

export interface CaptureResponse {
  success: boolean;
  captureId: string;
  authorizationId: string;
  amount: number;
  status: string;
  message?: string;
  timestamp: string;
}

export class VisaNetworkMock {
  private authorizations: Map<string, any>;
  private captures: Map<string, any>;
  private processingFee: number;

  constructor() {
    this.authorizations = new Map();
    this.captures = new Map();
    this.processingFee = parseFloat(process.env.VISA_PROCESSING_FEE || '0.029'); // 2.9% default
  }

  /**
   * Authorize a transaction (hold funds)
   */
  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    try {
      const authorizationId = `AUTH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 100));

      // Mock validation
      if (request.amount <= 0) {
        console.log('[POS_AUTH_DECISION]', { 
          decision: 'declined', 
          reason: 'Invalid amount', 
          auth_id: '' 
        });

        return {
          success: false,
          authorizationId: '',
          amount: request.amount,
          currency: request.currency,
          status: 'DECLINED',
          message: 'Invalid amount',
          timestamp: new Date().toISOString()
        };
      }

      // Store authorization
      const authorization = {
        authorizationId,
        cardNumber: request.cardNumber,
        amount: request.amount,
        currency: request.currency,
        merchantId: request.merchantId,
        metadata: request.metadata,
        status: 'AUTHORIZED',
        createdAt: new Date().toISOString()
      };

      this.authorizations.set(authorizationId, authorization);

      console.log('[POS_AUTH_DECISION]', { 
        decision: 'approved', 
        reason: 'Authorization successful', 
        auth_id: authorizationId 
      });

      return {
        success: true,
        authorizationId,
        amount: request.amount,
        currency: request.currency,
        status: 'AUTHORIZED',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Authorization error:', error);
      return {
        success: false,
        authorizationId: '',
        amount: request.amount,
        currency: request.currency,
        status: 'ERROR',
        message: 'Authorization failed',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Capture an authorized transaction (actually charge the funds)
   */
  async capture(request: CaptureRequest): Promise<CaptureResponse> {
    try {
      const authorization = this.authorizations.get(request.authorizationId);

      if (!authorization) {
        return {
          success: false,
          captureId: '',
          authorizationId: request.authorizationId,
          amount: 0,
          status: 'FAILED',
          message: 'Authorization not found',
          timestamp: new Date().toISOString()
        };
      }

      if (authorization.status !== 'AUTHORIZED') {
        return {
          success: false,
          captureId: '',
          authorizationId: request.authorizationId,
          amount: 0,
          status: 'FAILED',
          message: `Cannot capture ${authorization.status} authorization`,
          timestamp: new Date().toISOString()
        };
      }

      const captureAmount = request.amount || authorization.amount;

      if (captureAmount > authorization.amount) {
        return {
          success: false,
          captureId: '',
          authorizationId: request.authorizationId,
          amount: 0,
          status: 'FAILED',
          message: 'Capture amount exceeds authorization amount',
          timestamp: new Date().toISOString()
        };
      }

      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 100));

      const captureId = `CAP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const capture = {
        captureId,
        authorizationId: request.authorizationId,
        amount: captureAmount,
        status: 'CAPTURED',
        createdAt: new Date().toISOString()
      };

      this.captures.set(captureId, capture);

      // Update authorization status
      authorization.status = 'CAPTURED';
      authorization.capturedAmount = captureAmount;

      console.log('[POS_CAPTURE]', { 
        capture_id: captureId, 
        auth_id: request.authorizationId, 
        final_usd_cents: Math.round(captureAmount * 100) 
      });

      // Calculate profit breakdown
      const visaFee = this.getProcessingFee(captureAmount);
      const netToBank = captureAmount - visaFee;
      console.log('[PROFIT_BREAKDOWN]', { 
        transaction_usd_cents: Math.round(captureAmount * 100),
        visa_fee_cents: Math.round(visaFee * 100), 
        net_to_bank_cents: Math.round(netToBank * 100) 
      });

      return {
        success: true,
        captureId,
        authorizationId: request.authorizationId,
        amount: captureAmount,
        status: 'CAPTURED',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Capture error:', error);
      return {
        success: false,
        captureId: '',
        authorizationId: request.authorizationId,
        amount: 0,
        status: 'ERROR',
        message: 'Capture failed',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get processing fee for an amount
   */
  getProcessingFee(amount: number): number {
    return amount * this.processingFee;
  }

  /**
   * Get authorization details
   */
  getAuthorization(authorizationId: string): any {
    return this.authorizations.get(authorizationId);
  }

  /**
   * Get capture details
   */
  getCapture(captureId: string): any {
    return this.captures.get(captureId);
  }
}

export default new VisaNetworkMock();
