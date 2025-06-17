import { Router } from "@angular/router";
import * as pbi from 'powerbi-client';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { FetchClient, UserService, IFetchOptions, InventoryService } from "@c8y/client";
import { UserLogoutService } from "../../services/userLogout.service";
import { Subscription } from "rxjs";
import { UserActivityService } from '../../services/userActivity.service';
import { NotificationData } from "../../models/notification-data";
import { MatDialog } from "@angular/material/dialog";
import { UserInactivityService } from "../../services/userInactivity.service";



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
  chatMessages: any[] = [];

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
        'How many beds are there in the Facillity 001?',
        'How many beds have due predictive maintenance?'
      ]
    }
  ];

  showPredefinedQuestions = true;

  @ViewChild('powerbiContainer', { static: true })
  private containerRef!: ElementRef;
  private observer!: MutationObserver;

  @ViewChild('chatMessagesContainer') chatMessagesContainer: ElementRef;

  constructor(private router: Router,
    private fetchClient: FetchClient,
    private userService: UserService,
    private userLogoutService: UserLogoutService,
    private userActivityService: UserActivityService,
    private eRef: ElementRef,
    public dialog: MatDialog,
    private userInactitvityService: UserInactivityService,
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

  sendMessage() {
    if (this.userMessage.trim()) {
      // Hide predefined questions if user types their own question
      this.showPredefinedQuestions = false;
      // Add user message
      this.chatMessages.push({
        type: 'user',
        content: this.userMessage
      });
      this.userMessage = '';
      setTimeout(() => this.scrollToBottom(), 50);

      setTimeout(() => {
        this.chatMessages.push({
          type: 'bot',
          content: 'I received your message: ' + this.userMessage
        });
        setTimeout(() => this.scrollToBottom(), 50);
      }, 1000);
    }
  }

  scrollToBottom() {
    try {
      if (this.chatMessagesContainer && this.chatMessagesContainer.nativeElement) {
        this.chatMessagesContainer.nativeElement.scrollTop = this.chatMessagesContainer.nativeElement.scrollHeight;
      }
    } catch (err) {}
  }

  sendPredefinedQuestion(q: string) {
    this.userMessage = q;
    this.sendMessage();
    this.showPredefinedQuestions = false;
  }

  goBackToPredefinedQuestions() {
    this.showPredefinedQuestions = true;
    this.chatMessages = [];
    this.userMessage = '';
  }
}
