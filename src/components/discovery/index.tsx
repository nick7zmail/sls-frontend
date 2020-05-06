import { Component, ComponentChild, Fragment, h } from "preact";
import { Dictionary } from "../../types";
import { ZigbeePayload } from "./types";
import DeviceCard from "./device-card";
import Button from "../button";
import { Notyf } from "notyf";
import orderBy from "lodash/orderBy";
import { connect } from "unistore/preact";
import { GlobalState } from "../../store";
import actions, { Actions } from "../../actions";
import WebsocketManager from "../../websocket";
import { getDeviceDisplayName } from "../device-page/bind-row";
window["wsEventsData"] = window["wsEventsData"] || [];
const wsEventsData: object[] = window['wsEventsData'];

interface DiscoveryState {
    targetRouter: string;
    updateTimerId: number;
    joinDuration: number;
    events: Dictionary<ZigbeePayload[]>;
}

export class Discovery extends Component<GlobalState & Actions, DiscoveryState> {
    constructor() {
        super();

        this.state = {
            targetRouter: '0x0000',
            updateTimerId: 0,
            joinDuration: 0,
            events: {}
        };

    }

    processZigbeeEvent = ({ category, payload }): void => {
        wsEventsData.push({ category, payload })

        const message = { ...payload };
        // console.log("processZigbeeEvent", message);
        message.timestamp = Date.now();
        const { events } = this.state;
        const { ieeeAddr } = message;
        let { joinDuration, updateTimerId } = this.state;
        switch (message.event) {
            case "LinkData":
                break;
            case "PermitJoin":
                joinDuration = message.duration;
                window.clearInterval(updateTimerId);
                updateTimerId = window.setInterval(() => {
                    const { joinDuration, updateTimerId } = this.state;
                    if (joinDuration <= 0) {
                        window.clearInterval(updateTimerId);
                    } else {
                        this.setState({ joinDuration: joinDuration - 1 });
                    }

                }, 1000);
                break;
            default:
                if (events[ieeeAddr]) {
                    events[ieeeAddr].push(message);
                } else {
                    events[ieeeAddr] = [message];
                }
                break;

        }
        this.setState({ events, joinDuration, updateTimerId });
    }

    componentDidMount(): void {
        const { getZigbeeDevicesList } = this.props;
        const manager = new WebsocketManager();
        console.log("use `copy(wsEventsData)` to copy events log");
        manager.subscribe("zigbee", this.processZigbeeEvent);
        getZigbeeDevicesList(true);
        setTimeout(() => this.enableJoin(), 500);
    }

    renderDevices(): ComponentChild {
        const { startInterview } = this.props;
        const { events } = this.state;
        const sortedEvents = orderBy(Object.entries(events), ([_, events]) => events[0].timestamp).reverse();

        return (<Fragment>
            {this.renderJoinButton()}
            <div className="row no-gutters">{sortedEvents.map(([ieeeAddr, events]) => <DeviceCard startInterview={startInterview}
                ieeeAddr={ieeeAddr} events={events} />)}</div>
        </Fragment>);

    }

    enableJoin = (targetRouter = '0x0000'): void => {
        const { setJoinDuration } = this.props;

        setJoinDuration(255, targetRouter).then(() => {
            this.setState({ targetRouter });
            new Notyf({ position: { x: "left", y: "bottom" } }).success(`Join enabled on ${targetRouter}`);
        })

    };
    disableJoin = async () => {
        const { targetRouter } = this.state;
        const { setJoinDuration } = this.props;
        await setJoinDuration(0, targetRouter);
        new Notyf({ position: { x: "left", y: "bottom" } }).success("Join disabled");
    };

    renderJoinButton(): ComponentChild {
        const { joinDuration } = this.state;
        const { devices } = this.props;
        const routers = devices.filter(d => d.type == "Router");
        return (<div class="row h-100 justify-content-center align-items-center">
            {joinDuration <= 0 ? (
                <div class="btn-group">
                    <Button<string> className="btn btn-success" onClick={this.enableJoin} item={'0x0000'}>Enable
                     join</Button>
                    <button type="button" class="btn btn-success dropdown-toggle dropdown-toggle-split" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                        <span class="sr-only">Toggle</span>
                    </button>
                    <div class="dropdown-menu">
                        {
                            routers.map(router => <a onClick={(): void => this.enableJoin(router.nwkAddr)} class="dropdown-item" href="#">{getDeviceDisplayName(router)}</a>)
                        }
                    </div>
                </div>
            ) : (<div>Join enabled for {joinDuration} seconds, <a href="#" onClick={this.disableJoin}>Stop</a></div>)
            }

        </div>
        );
    }

    renderEmptyScreen(): ComponentChild {
        return (
            <Fragment>
                <div class="row h-100 justify-content-center align-items-center">
                    <h2>Nothing yet happened</h2>
                </div>
                {this.renderJoinButton()}
            </Fragment>
        );
    }


    render(): ComponentChild {
        const { events } = this.state;
        const hasAnyEvents = Object.keys(events).length !== 0;
        return <div class="container-fluid h-100">{hasAnyEvents ? this.renderDevices() : this.renderEmptyScreen()}</div>
    }
}

const mappedProps = ["isLoading", "time", "devices"];
const ConnectedDiscovery = connect<{}, DiscoveryState, GlobalState, Actions>(mappedProps, actions)(Discovery);
export default ConnectedDiscovery;
