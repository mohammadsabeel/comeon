import { Router } from "@angular/router";
import * as pbi from 'powerbi-client';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, NgZone } from "@angular/core";
import { FetchClient, UserService, IFetchOptions, InventoryService } from "@c8y/client";
import { UserLogoutService } from "../../services/userLogout.service";
import { Subscription } from "rxjs";
import { UserActivityService } from '../../services/userActivity.service';
import { NotificationData } from "../../models/notification-data";
import { MatDialog } from "@angular/material/dialog";
import { UserInactivityService } from "../../services/userInactivity.service";
import { marked } from 'marked';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpClient, HttpHeaders } from "@angular/common/http";


@Component({
  selector: "c8y-hillrom-actionable-insights",
  templateUrl: "./actionable-insights.component.html",
  styleUrls: ["./actionable-insights.component.css"],
})
export class ActionableInsightsComponent implements OnInit {
  reportId: string;
  embededToken: string;
  embededUrl: string;
  private powerbiService: pbi.service.Service;
  currentLoggedInUserEmail;
  powerBIError: boolean;
  currentLoggedInUserDisplayName;
  userManagerRole = true;
  userRollUp = false;
  TOKEN_KEY = '_tcy8';
  TFATOKEN_KEY = 'TFAToken';
  uriToMainPage = "#";
  isUserRollup = sessionStorage.getItem("CURRENT_LOGGEDIN_USER_SHOW_ROLLUP");
  progressColor = "#2a3da3";
  subscription: Subscription;
  isSSOUser = false;
  isNotifications = true;
  subscriptions: Subscription[] = [];
  notificationsList: NotificationData[] = [];
  notifications = [];
  currDiv = false;
  aiSupportedSepdeviceList = [];
  listFacilityIds = [];
  uri: string = "service/scrm-configurations/1.0.0/getAISupportedAssetTypes"
  managedObjects: any;
  isChatOpen = false;
  userMessage = '';
  chatMessages: { type: string; content: string; html?: SafeHtml }[] = [];
  private apiUrl = ''; // Replace with your actual API endpoint
  private bearerToken = ''
  // Predefined questions for the chat bot
  predefinedQuestions = [
    {
      category: 'Error codes',
      questions: [
        '0x1040',
        '0x1051'
      ]
    },
    {
      category: 'General',
      questions: [
        'How to clear error codes?',
        'How to replace a footboard on Centrella?',
        'part number for centrella right siderail'
      ]
    },
    {
      category: 'Actionable Insights',
      questions: [
        'How many beds are due for PM?',
        'Provide error history for device - Y156PF4916',
        'How many devices have utilization rate less than 20%?'
      ]
    },
  ];

  showPredefinedQuestions = true;

  @ViewChild('powerbiContainer', { static: true })
  private containerRef!: ElementRef;
  private observer!: MutationObserver;

  @ViewChild('chatMessagesContainer') chatMessagesContainer: ElementRef;

  isListening = false;
  recognition: any;
  transcript: string = '';

  constructor(private router: Router,
    private http: HttpClient,
    private fetchClient: FetchClient,
    private userService: UserService,
    private userLogoutService: UserLogoutService,
    private userActivityService: UserActivityService,
    private eRef: ElementRef,
    public dialog: MatDialog,
    private userInactitvityService: UserInactivityService,
    private sanitizer: DomSanitizer,
    private ngZone: NgZone
  ) {
    //powerbi

    this.powerbiService = new pbi.service.Service(pbi.factories.hpmFactory, pbi.factories.wpmpFactory, pbi.factories.routerFactory)
  }
  ngOnInit() {

    this.powerBIError = false;
    this.fetchCurrentUser();
    this.userInactitvityService.setupTimers();
    this.userActivityService.setupTimers();
    this.getActionableInsightsReport();

  }

  async onUserInput(inputData: string) :Promise<string>{
    const headers = new HttpHeaders({
      'Authorization' : `Bearer ${this.bearerToken}`,
      'Content-Type': 'application/json'
    });
    const body = {
      'input_data': inputData
    };
    const response = await this.http.post(this.apiUrl, body, { headers }).toPromise();
    return response['output'];

  }

  async getChat(prompt: string): Promise<string> {
    const output = await this.onUserInput(prompt);
    return output;
  }

  public embedPowerbiReport(data): void {
    const reportContainer = this.containerRef.nativeElement;
    console.log("embedPowerbiReport start...");

    const embedConfiguration: pbi.IEmbedConfiguration = {
      type: 'report',
      tokenType: pbi.models.TokenType.Embed,
      accessToken: data.embededToken,
      embedUrl: data.embededUrl,
      id: data.reportId,

      settings: { filterPaneEnabled: false, navContentPaneEnabled: false }
    }
    const report = this.powerbiService.embed(reportContainer, embedConfiguration);

    report.on('loaded', () => {
      this.applyMargin();
      this.observeDomChanges();
      window.scrollTo(0, 0);

    });

    report.on('pageChanged', () => {
      this.applyMargin();
      this.observeDomChanges();
      window.scrollTo(0, 0);

    });

    report.on('rendered', () => {
      this.applyMargin();
      this.observeDomChanges();
      window.scrollTo(0, 0);

    });




  }

  async getEmbedDetails(commaSepfacList, commaSepdeviceList) {
    console.log(("Enter getEmbedDetails..."));
    let head = {
      'Content-Type': 'application/json'
    };
    try {
      let facilityIds = commaSepfacList;
      let devices = commaSepdeviceList;
      let response = await this.fetchClient.fetch('/service/webmethod-io-reports/2.0.0/getEmbedDetailsStringList?facilityIds=' + facilityIds + '&devices=' + devices,
        {
          headers: head,
          method: 'GET',
        });

      let spinnerElement = document.getElementById("spinner") as HTMLElement;
      spinnerElement.style.display = "none";

      if (response.status === 200 || response.status === 201) {
        const reportresponse = await response.json();
        let data = {
          reportId: reportresponse.reportId,
          embededToken: reportresponse.embedToken,
          embededUrl: reportresponse.embedUrl

        };
        this.embedPowerbiReport(data);

      }
      else {
        this.activateError();

      }
    }
    catch {
      this.activateError();
    }
  }

  //Function that allows for the managed object data 
  async getActionableInsightsReport() {
    const response = await this.fetchClient.fetch(this.uri);
    this.managedObjects = await response.json();

    const sessionOrgData = sessionStorage.getItem('enterprises');

    if (sessionOrgData) {
      const parsedOrgData = JSON.parse(sessionOrgData);
      if (parsedOrgData) {
        const deviceList = [];
        parsedOrgData.forEach((fac: any) => {
          fac.facility.forEach((facId: any) => {
            this.listFacilityIds.push(facId.facilityId);
            facId.deviceTypeCounts.forEach((deviceTypeCount: any) => {
              if (deviceTypeCount.deviceCount > 0) {
                if (!deviceList.includes(deviceTypeCount.type)) {
                  deviceList.push(deviceTypeCount.type);
                }
              }
            });
          });
        });
        for (let x of deviceList) {
          for (let y of this.managedObjects) {
            if (x === y.assetType && y.isAISupported == true) {

              this.aiSupportedSepdeviceList.push(x);
            }
          }
        }

      }
    }
    this.getEmbedDetails(this.listFacilityIds, this.aiSupportedSepdeviceList);
  }

  async fetchCurrentUser() {
    if (window.sessionStorage.getItem("CURRENT_LOGGEDIN_USER_EMAIL") == null || window.sessionStorage.getItem("CURRENT_LOGGEDIN_USER_EMAIL") == undefined) {
      const { data, res } = await this.userService.current();
      this.isSSOUser = false;
      if (res.status === 200 && data.customProperties != undefined) {
        if (data.customProperties.userOrigin === 'OAUTH2') {
          this.isSSOUser = true;
          window.sessionStorage.setItem("IS_LOGGEDIN_SSO_USER", "true");
        }

        this.currentLoggedInUserEmail = data.id;
        if (data.email === null || data.email === undefined) {
          this.currentLoggedInUserEmail = data.id;
        }

        if (data.firstName !== undefined && data.firstName != null && data.firstName.length > 0 && data.lastName !== undefined && data.lastName !== null && data.lastName.length > 0) {
          this.currentLoggedInUserDisplayName = data.firstName.trim() + " " + data.lastName.trim();
        }
        else if (data.firstName !== undefined && data.firstName !== null && data.firstName.trim().length > 0) {
          this.currentLoggedInUserDisplayName = data.firstName.trim();
        }
        else if (data.lastName !== undefined && data.lastName !== null && data.lastName.trim().length > 0) {
          this.currentLoggedInUserDisplayName = data.lastName.trim();
        }
        else {
          this.currentLoggedInUserDisplayName = data.email.toLowerCase();
          const pos = data.email.indexOf("@");
          this.currentLoggedInUserDisplayName = data.email.substring(0, pos + 1) + "..";
        }
      }
    }
  }


  activateError() {
    this.powerBIError = true;
  }

  applyMargin() {
    if (this.containerRef && this.containerRef.nativeElement) {
      this.containerRef.nativeElement.style.setProperty('margin-top', '45px', 'important');
    }
  }



  observeDomChanges() {
    if (this.containerRef && this.containerRef.nativeElement) {
      this.observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => { console.log('Mutation observed:', mutation); }); this.applyMargin();
      });
      this.observer.observe(this.containerRef.nativeElement,
        { childList: true, subtree: true }); console.log('MutationObserver is set up.');
    }
  }


  ngOnDestroy() {
    if (this.containerRef.nativeElement) {
      this.powerbiService.reset(this.containerRef.nativeElement)
    }
  }










  async createLoginAuditLogEntry() {
    const options: object = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    let paramValues = "requestor_id=" + this.currentLoggedInUserEmail + "&user_id=" + this.currentLoggedInUserEmail + "&text=User " + this.currentLoggedInUserEmail + " Logged in&activity=User login";
    const auditResponse = await this.fetchClient.fetch('/service/user-management/user/auditLog?' + paramValues, options);
  }
  showLogout() {
    this.currDiv = !this.currDiv;
  }
  logout() {
    this.userLogoutService.logoutFromApplication();
  }

  @HostListener('document:click', ['$event'])
  clickIfClickedOutside(event) {

    if (this.eRef.nativeElement.contains(event.target)) {
      if ((!event.target.id.startsWith("dvLogout")) &&
        (!event.target.id.startsWith("logout"))) {

      }
    } else {
      if (this.currDiv) {

        this.currDiv = false;
      }
    }

  }
  toggleChat() {
    this.isChatOpen = !this.isChatOpen;
    if (this.isChatOpen && this.chatMessages.length === 0) {
      this.chatMessages.push({
        type: 'bot',
        content: 'Hello! How can I help you today?'
      });
    }
  }

  toggleVoiceRecognition() {
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  startListening() {
    // Use webkitSpeechRecognition for Chrome, SpeechRecognition for others
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }
    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'en-US';
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.ngZone.run(() => this.isListening = true);
    };

    this.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      this.ngZone.run(() => {
        this.transcript = transcript;
        this.userMessage = transcript;
        this.isListening = false;
        this.sendMessage();
      });
    };

    this.recognition.onerror = (event: any) => {
      this.ngZone.run(() => {
        this.isListening = false;
        alert('Speech recognition error: ' + event.error);
      });
    };

    this.recognition.onend = () => {
      this.ngZone.run(() => this.isListening = false);
    };

    this.recognition.start();
  }

  stopListening() {
    if (this.recognition) {
      this.recognition.stop();
    }
    this.isListening = false;
  }

  async sendMessage() {
    if (!this.userMessage.trim()) return;

    // Add user message to chat
    this.chatMessages.push({
      type: 'user',
      content: this.userMessage
    });

    // Show loading state
    this.chatMessages.push({
      type: 'bot',
      content: 'Thinking...'
    });

    try {
      // Call ML API
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({

          "dataframe_records": [
            {
                "input_string": this.userMessage
            }
        ]
        })
      });

      const data = await response.json();
      console.log(data.predictions)
      // Remove loading message
      this.chatMessages.pop();
      
      // Add bot response with markdown support
      this.chatMessages.push({
        type: 'bot',
        content: data.predictions,
        //html: this.convertMarkdownToHtml(data.predictions)
      });
    } catch (error) {
      // Remove loading message
      this.chatMessages.pop();
      
      // Add error message
      this.chatMessages.push({
        type: 'bot',
        content: 'Sorry, I encountered an error. Please try again.'
      });
      console.error('Error calling ML API:', error);
    }

    this.userMessage = '';
    this.showPredefinedQuestions = false;
    setTimeout(() => this.scrollToBottom(), 100);
  }

  async sendPredefinedQuestion(q: string) {
    this.userMessage = q;
    await this.sendMessage();
  }

  scrollToBottom() {
    try {
      if (this.chatMessagesContainer && this.chatMessagesContainer.nativeElement) {
        this.chatMessagesContainer.nativeElement.scrollTop = this.chatMessagesContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }

  goBackToPredefinedQuestions() {
    this.showPredefinedQuestions = true;
    this.chatMessages = [];
    this.userMessage = '';
  }
}
