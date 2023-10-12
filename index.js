import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

// Read configuration values from Pulumi.dev.yaml
const awsConfig = new pulumi.Config();
const awsRegion = awsConfig.require("region");
const vpcCidrBlock = awsConfig.require("CidrBlock");
const availabilityZones = JSON.parse(awsConfig.require("availabilityZones"));
// const publicSubnetCidrBlock = awsConfig.require("publicSubnetCidrBlock");
// const privateSubnetCidrBlock = awsConfig.require("privateSubnetCidrBlock");

// Create an AWS VPC
const vpc = new aws.ec2.Vpc("vpcuno", {
    cidrBlock: vpcCidrBlock,
    enableDnsSupport: true,
    enableDnsHostnames: true,
    region: awsRegion,
});

// Create an Internet Gateway and attach it to the VPC
const internetGateway = new aws.ec2.InternetGateway("internet-gateway", {
    vpcId: vpc.id,
});

const publicSubnets = [];
const privateSubnets = [];

// Create public and private subnets in different availability zones
for (const [i, az] of availabilityZones.entries()) {
    const publicSubnetCidrBlock = `10.0.${i * 2}.0/24`; // Calculate public subnet CIDR block
    const privateSubnetCidrBlock = `10.0.${i * 2 + 1}.0/24`; // Calculate private subnet CIDR block

    const publicSubnet = new aws.ec2.Subnet(`public-subnet-${i}`, {
        vpcId: vpc.id,
        cidrBlock: publicSubnetCidrBlock,
        availabilityZone: az,
        mapPublicIpOnLaunch: true,
    });
    
    const privateSubnet = new aws.ec2.Subnet(`private-subnet-${i}`, {
        vpcId: vpc.id,
        cidrBlock: privateSubnetCidrBlock,
        availabilityZone: az,
    });

    publicSubnets.push(publicSubnet);
    privateSubnets.push(privateSubnet);
}




// Create public and private Route Tables
const publicRouteTable = new aws.ec2.RouteTable("public-route-table", {
    vpcId: vpc.id,
});

const privateRouteTable = new aws.ec2.RouteTable("private-route-table", {
    vpcId: vpc.id,
});

// Associate Route Tables with respective Subnets
for (const [i, subnet] of publicSubnets.entries()) {
    new aws.ec2.RouteTableAssociation(`public-subnet-association-${i}`, {
        subnetId: subnet.id,
        routeTableId: publicRouteTable.id,
    });
}

for (const [i, subnet] of privateSubnets.entries()) {
    new aws.ec2.RouteTableAssociation(`private-subnet-association-${i}`, {
        subnetId: subnet.id,
        routeTableId: privateRouteTable.id,
    });
}

// Create a public route in the public route table with destination CIDR block 0.0.0.0/0 and Internet Gateway as the target
new aws.ec2.Route("public-route", {
    routeTableId: publicRouteTable.id,
    destinationCidrBlock: "0.0.0.0/0",
    gatewayId: internetGateway.id,
});

// Export relevant resource IDs for later use
export const vpcId = vpc.id;
export const publicSubnetIds = publicSubnets.map(s => s.id);
export const privateSubnetIds = privateSubnets.map(s => s.id);