const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const gcp = require("@pulumi/gcp");
const AWS = require('aws-sdk');

// AWS Configurations
const awsProfile = new pulumi.Config("aws").require("profile");
const awsRegion = new pulumi.Config("aws").require("region");
const awsVpcCidr = new pulumi.Config("vpc").require("cidrBlock");
const keyName = new pulumi.Config().require("keynamepair"); 
const domainName = new pulumi.Config().require("domainname"); 
const gcpProjectName = new pulumi.Config("gcp").require("project");
const mailGunDomain = new pulumi.Config().require("mailGunDomain");
const mailGunKey = new pulumi.Config().require("mailGunKey");
const demoCertArn = new pulumi.Config().require("demoCertArn");



// Function to get the most recent AMI
function getMostRecentAmi() {
  // Adjust the filters to match the AMIs you're interested in
  return aws.ec2.getAmi({
    filters: [{
      name: "name",
      values: ["Assignment5AMI_*"], 
    }],
    mostRecent: true
  });
}

// Using AWS Profile
const awsProvider = new aws.Provider("awsacc", {
  profile: awsProfile,
  region: awsRegion,
});



// VPC
const vpc = new aws.ec2.Vpc("myVpc", {
  cidrBlock: awsVpcCidr,
  enableDnsSupport: true,
  enableDnsHostnames: true,
  tags: {
    Name: "MyVPC",
  },
});

// Function to get the availability zones
async function getAzs() {
  const zones = await aws.getAvailabilityZones({ state: "available" });
  return zones.names.slice(0, 3);
}

const azs = pulumi.output(getAzs());

// Create 3 public subnets and 3 private subnets, each in a different AZ
const publicSubnets = azs.apply((azNames) =>
  azNames.map((az, i) => {
    return new aws.ec2.Subnet(`public-subnet-${i + 1}`, {
      vpcId: vpc.id,
      cidrBlock: `10.0.${i + 1}.0/24`,
      mapPublicIpOnLaunch: true,
      availabilityZone: az,
      tags: {
        Name: `public-subnet-${i + 1}`,
      },
    });
  })
);

const privateSubnets = azs.apply((azNames) =>
  azNames.map((az, i) => {
    return new aws.ec2.Subnet(`private-subnet-${i + 1}`, {
      vpcId: vpc.id,
      cidrBlock: `10.0.${i + 4}.0/24`,
      mapPublicIpOnLaunch: false,
      availabilityZone: az,
      tags: {
        Name: `private-subnet-${i + 1}`,
      },
    });
  })
);

const publicSubnetIds = pulumi.all(publicSubnets).apply(subnets =>
  subnets.map(subnet => subnet.id)
);

// Create an Internet Gateway and attach it to the VPC
const internetGateway = new aws.ec2.InternetGateway("myInternetGateway", {
  vpcId: vpc.id,
  tags: {
    Name: "MyInternetGateway",
  },
});

// Create a public route table and associate public subnets
const publicRouteTable = new aws.ec2.RouteTable("public-route-table", {
  vpcId: vpc.id,
  tags: {
    Name: "Public Route Table",
  },
});

const publicSubnetAssociations = publicSubnets.apply((subnets) =>
  subnets.map((subnet, i) => {
    return new aws.ec2.RouteTableAssociation(`public-route-table-association-${i}`, {
      routeTableId: publicRouteTable.id,
      subnetId: subnet.id,
    });
  })
);

// Create a private route table and associate private subnets
const privateRouteTable = new aws.ec2.RouteTable("private-route-table", {
  vpcId: vpc.id,
  tags: {
    Name: "Private Route Table",
  },
});

const privateSubnetAssociations = privateSubnets.apply((subnets) =>
  subnets.map((subnet, i) => {
    return new aws.ec2.RouteTableAssociation(`private-route-table-association-${i}`, {
      routeTableId: privateRouteTable.id,
      subnetId: subnet.id,
    });
  })
);

// Create a public route in the public route table to the Internet Gateway
const publicRoute = new aws.ec2.Route("public-route", {
  routeTableId: publicRouteTable.id,
  destinationCidrBlock: "0.0.0.0/0",
  gatewayId: internetGateway.id,
});




new aws.ec2.Route("internet-route", {
  routeTableId: publicRouteTable.id,
  destinationCidrBlock: "0.0.0.0/0",
  gatewayId: internetGateway.id,
});


// Example Application Security Group (customize as needed)
const appSecurityGroup = new aws.ec2.SecurityGroup("appSecurityGroup", {
  vpcId: vpc.id,
  description: "Application Security Group",
  tags: {
    Name: "Application Security Group",
  },
});

const dbSecurityGroup = new aws.ec2.SecurityGroup("dbSecurityGroup",{
  vpcId: vpc.id,
  description: "Database Security Group",
  tags: {
    Name: "Database Security Group",
  },
})

const loadbalancerSecurityGroup = new aws.ec2.SecurityGroup("LoadBalancerSecurityGroup",{
  vpcId: vpc.id,
  description: "LoadBalancerSecurityGroup",
  tags: {
    Name: "LoadBalancerSecurityGroup",
  },
})

new aws.ec2.SecurityGroupRule("lbIngressHttp", {
  type: "ingress",
  securityGroupId: loadbalancerSecurityGroup.id,
  protocol: "tcp",
  fromPort: 80,
  toPort: 80,
  cidrBlocks: ["0.0.0.0/0"],
});

new aws.ec2.SecurityGroupRule("lbIngressHttps", {
  type: "ingress",
  securityGroupId: loadbalancerSecurityGroup.id,
  protocol: "tcp",
  fromPort: 443,
  toPort: 443,
  cidrBlocks: ["0.0.0.0/0"],
});

new aws.ec2.SecurityGroupRule("lbEgressAllTraffic", {
  type: "egress", 
  securityGroupId: loadbalancerSecurityGroup.id,
  protocol: "-1", 
  fromPort: 0,    
  toPort: 0,
  cidrBlocks: ["0.0.0.0/0"], 
});

const dbParameterGroup = new aws.rds.ParameterGroup("dbparametergroup", {
  family: "mariadb10.5", 
  description: "Custom Parameter Group for MariaDB",
  parameters: [
      {
          name: "max_connections",
          value: "100",
      },
  ],
});



new aws.ec2.SecurityGroupRule("dbIngress", {
  type: "ingress",
  securityGroupId: dbSecurityGroup.id,
  protocol: "tcp",
  fromPort: 3306,
  toPort: 3306,
  sourceSecurityGroupId: appSecurityGroup.id,
});

new aws.ec2.SecurityGroupRule("outboundToDB", {
  type: "egress",
  securityGroupId: appSecurityGroup.id,
  protocol: "tcp",
  fromPort: 3306,
  toPort: 3306,
  sourceSecurityGroupId: dbSecurityGroup.id,
});

new aws.ec2.SecurityGroupRule("outboundToInternet", {
  type: "egress",
  securityGroupId: appSecurityGroup.id,
  protocol: "tcp",
  fromPort: 443,
  toPort: 443,
  cidrBlocks: ["0.0.0.0/0"], // This allows traffic to all IPv4 addresses
});



// Output the IDs of private subnets
const privateSubnetIds = privateSubnets.apply(subnets => subnets.map(subnet => subnet.id));

const dbSubnetGroup = new aws.rds.SubnetGroup("mydbsubnetgroup", {
  subnetIds: [
    privateSubnets[0].id, 
    privateSubnets[1].id, 
  ],
});


new aws.ec2.SecurityGroupRule("sshIngress", {
  type: "ingress",
  securityGroupId: appSecurityGroup.id,
  protocol: "tcp",
  fromPort: 22,
  toPort: 22,
  cidrBlocks: ["0.0.0.0/0"]
});



new aws.ec2.SecurityGroupRule("appPortIngress", {
  type: "ingress",
  securityGroupId: appSecurityGroup.id,
  protocol: "tcp",
  fromPort: 6969,  
  toPort: 6969,    
  sourceSecurityGroupId: loadbalancerSecurityGroup.id,
});




const ami = pulumi.output(getMostRecentAmi());





// Application Load Balancer
const appLoadBalancer = new aws.lb.LoadBalancer("appLoadBalancer", {
  internal: false,
  loadBalancerType: "application",
  securityGroups: [loadbalancerSecurityGroup.id],
  subnets: publicSubnetIds,
  enableDeletionProtection: false,
  tags: {
      Name: "MyAppLoadBalancer",
  },
}, { provider: awsProvider });

// Target Group
const targetGroup = new aws.lb.TargetGroup("targetGroup", {
  port: 6969, 
  protocol: "HTTP",
  vpcId: vpc.id,
  targetType: "instance",
  healthCheck: {
    enabled: true,
    path: "/healthz", 
    protocol: "HTTP",
    port:"6969",
    interval: 30,
    timeout: 5,
    healthyThreshold: 2,
    unhealthyThreshold: 2,
  },
}, { provider: awsProvider });



const demoListener = new aws.lb.Listener("demoListener", {
  loadBalancerArn: appLoadBalancer.arn,
  port: 443,
  protocol: "HTTPS",
  sslPolicy: "ELBSecurityPolicy-2016-08",
  certificateArn: demoCertArn,
  defaultActions: [{
      type: "forward",
      targetGroupArn: targetGroup.arn,
  }],
}, { provider: awsProvider });




// // Listener
// const listener = new aws.lb.Listener("listener", {
//   loadBalancerArn: appLoadBalancer.arn,
//   port: 80,
//   protocol: "HTTP",
//   defaultActions: [{
//       type: "forward",
//       targetGroupArn: targetGroup.arn,
//   }],
// }, { provider: awsProvider });

const rdsInstance = new aws.rds.Instance("myrdsinstance", {
  allocatedStorage: 20, 
  storageType: "gp2", 
  engine: "mariadb", 
  engineVersion: "10.5", 
  instanceClass: "db.t2.micro", 
  multiAz: false,
  name: "csye6225",
  username: "csye6225",
  password: "masterpassword",
  parameterGroupName: dbParameterGroup.name, 
  vpcSecurityGroupIds: [dbSecurityGroup.id], 
  dbSubnetGroupName: dbSubnetGroup.name, 
  skipFinalSnapshot: true, 
  publiclyAccessible: false, 
});


rds_endpoint = rdsInstance.endpoint
rdwoport = rds_endpoint.apply(endpoint => {
  const parts = endpoint.split(':');
  const modifiedEndpoint = `${parts[0]}:${parts[1]}`;
  return modifiedEndpoint.slice(0, -5); 
});

//GCP

const storageBucket = new gcp.storage.Bucket("assignmentuploadsbucket", {
  location: "US",
  forceDestroy: true,  
});

const serviceAccount = new gcp.serviceaccount.Account("myServiceAccount", {
  accountId: "my-service-account",
  displayName: "My Service Account",
});

const serviceAccountKey = new gcp.serviceaccount.Key("myServiceAccountKey", {
  serviceAccountId: serviceAccount.name,
});

const storageAdminBinding = new gcp.projects.IAMMember("storage-admin-binding", {
  project: gcpProjectName ,
  member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`,
  role: "roles/storage.objectAdmin",
});

// // Create an AWS Secrets Manager secret with a new unique name
// const secNameforgcpkeys = new aws.secretsmanager.Secret("secNameforgcpkeys", {
//   name: "secNameforgcpkeys", // Replace with your new unique secret name
//   description: "Google Cloud service account key for Lambda",
// });

// // Store the service account key in the new secret
// const googleCloudSecretVersion = new aws.secretsmanager.SecretVersion("newGoogleCloudSecretVersion", {
//   secretId: secNameforgcpkeys.id,
//   secretString: pulumi.all([serviceAccountKey.privateKey, serviceAccount.email, serviceAccountKey.privateKeyId]).apply(([key, email, keyId]) => {
//     // Convert the base64 encoded key back to a string
//     const decodedKey = Buffer.from(key, 'base64').toString('utf-8');
    
//     // Replace escaped newline characters with actual newline characters
//     const formattedKey = decodedKey.replace(/\\n/g, '\n');

//     return JSON.stringify({
//       type: "service_account",
//       project_id: gcpProjectName,
//       private_key_id: keyId, 
//       private_key: formattedKey, // Use the formatted key
//       client_email: email,
//       // Include other necessary fields...
//     });
//   }),
// });



const dynamoDbTable = new aws.dynamodb.Table("myTable", {
  attributes: [
      { name: "id", type: "S" }  // Only define attributes used as keys
  ],
  hashKey: "id",
  billingMode: "PAY_PER_REQUEST",
  // Other configurations...
});

// Create an SNS Topic
const snsTopic = new aws.sns.Topic("serverlessTopic", {
  displayName: "Serverless SNS Topic for Lambda Functions",
}, { provider: awsProvider });

exports.topicName = snsTopic.name;
exports.topicArn = snsTopic.arn;


// Read in the Lambda zip file
const lambdaZipPath = '/Users/ankithreddy/Desktop/cloud/Nov22/lambda.zip';
const lambdaZip = new pulumi.asset.FileArchive(lambdaZipPath);

// IAM Role for Lambda Function
const lambdaRole = new aws.iam.Role("lambdaRole", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Action: "sts:AssumeRole",
      Effect: "Allow",
      Principal: {
        Service: "lambda.amazonaws.com",
      },
    }],
  }),
});

// Attach necessary policies to the role
const lambdaPolicyDocument = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
      {
          Effect: "Allow",
          Action: [
              "sns:Publish",
              "dynamodb:PutItem",
              "dynamodb:GetItem",
              "secretsmanager:GetSecretValue",
              "logs:CreateLogGroup",
				      "logs:CreateLogStream",
				      "logs:PutLogEvents",
              "s3:GetObject"
          ],
          Resource: "*" 
      }
  ]
});

const lambdaPolicy = new aws.iam.RolePolicy("lambdaPolicy", {
  role: lambdaRole.id,
  policy: lambdaPolicyDocument,
});
 
const serviceAccountKeyString = pulumi.all([serviceAccountKey.privateKey, serviceAccount.email, serviceAccountKey.privateKeyId]).apply(([key, email, keyId]) => {
  // Decode the base64 encoded private key
 // Directly create the credentials object with the correctly formatted private key


  // Convert the credentials object to a string for use in environment variables
  const credentialsString = JSON.stringify(key);
  const decodedStringcredentials = Buffer.from(credentialsString, 'base64').toString('utf-8');



  // Log the formatted credentials for debugging purposes
  console.log(`Formatted GCP Service Account Credentials: ${decodedStringcredentials}`);
  return decodedStringcredentials;
});

// Create the Lambda function
const lambda = new aws.lambda.Function("myLambdaFunction", {
  runtime: aws.lambda.Runtime.NodeJS14dX,
  code: lambdaZip,
  handler: "index.handler",  
  role: lambdaRole.arn,
  environment: {
      variables: {
        SNS_TOPIC_ARN: snsTopic.arn,
        GCS_BUCKET_NAME: storageBucket.name,
        DYNAMODB_TABLE_NAME: dynamoDbTable.name,
        GCP_SERVICE_ACCOUNT: serviceAccountKeyString,
        MAILGUN_API_KEY: mailGunKey,
        MAILGUN_DOMAIN: mailGunDomain,
        

      },
  },
}, { provider: awsProvider });

// // Create the CloudWatch Log Group
// const logGroup = new aws.cloudwatch.LogGroup("myLogGroup", {
//   name: pulumi.interpolate`/aws/lambda/${lambda.name}`,
//   retentionInDays: 7, // Adjust retention as needed.
// });
// // Associate Lambda function with the log group
// const logGroupLambdaPermission = new aws.lambda.Permission("myLogGroupLambdaPermission", {
//   action: "lambda:InvokeFunction",
//   function: lambda.arn,
//   principal: "logs.amazonaws.com",
//   sourceArn: logGroup.arn,
// });
// const logStream = new aws.cloudwatch.LogStream("myLogStream", {
//   logGroupName: logGroup.name,
//   name: "myLogStream", 
// });

// SNS Subscription to Lambda
const snsSubscription = new aws.sns.TopicSubscription("snsToLambda", {
  topic: snsTopic.arn,
  protocol: "lambda",
  endpoint: lambda.arn,
}, { provider: awsProvider });

// Lambda permission to allow SNS invocation
const lambdaPermission = new aws.lambda.Permission("lambdaPermission", {
  action: "lambda:InvokeFunction",
  function: lambda.name,
  principal: "sns.amazonaws.com",
  sourceArn: snsTopic.arn,
}, { provider: awsProvider });




// Export the name and ARN of the topic

exports.lambdaFunctionArn = lambda.arn;



db_name = rdsInstance.name
db_username= rdsInstance.username
db_password= rdsInstance.password
sns_arn=  snsTopic.arn;

// Attach an inline policy for SNS publish
const snsPublishPolicy = new aws.iam.Policy("sns-publish-policy", {
  name: "sns-publish-policy",
  description: "Allows publishing to SNS topics",
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "sns:Publish",
        Resource: "*",
      },
    ],
  }),
});

// IAM Role for EC2 Instance
const role = new aws.iam.Role("cloudwatch-agent-role", {
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: {
          Service: "ec2.amazonaws.com",
        },
      },
    ],
  }),
  // Add managed policies for CloudWatch Agent and SNS publishing
  managedPolicyArns: [
    "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
    snsPublishPolicy.arn,
  ],
});



// Attach the CloudWatchAgentServerPolicy
const policyAttachment = new aws.iam.RolePolicyAttachment("cloudwatch-agent-policy-attachment", {
  role: role,
  policyArn: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
});

// Attach the sns-publish-policy
const snsPolicyAttachment = new aws.iam.RolePolicyAttachment("sns-publish-policy-attachment", {
  role: role,
  policyArn: snsPublishPolicy.arn,
});

// Create an Instance Profile for the EC2 instance
const instanceProfile = new aws.iam.InstanceProfile("cloudwatch-agent-instance-profile", {
  role: role,
});


const userData = pulumi.interpolate`#!/bin/bash

echo "DB_USERNAME=${db_username}" > /opt/csye6225/.env
echo "DB_PASSWORD=${db_password}" >> /opt/csye6225/.env
echo "DB_NAME=${db_name}" >> /opt/csye6225/.env
echo "DB_HOST=${rdwoport}" >> /opt/csye6225/.env
echo "DATABASE_URL=mysql://${db_username}:${db_password}@${rdwoport}" >> /opt/csye6225/.env
echo "SNS_ARN=${sns_arn}" >> /opt/csye6225/.env
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:/opt/csye6225/cloud-watchconfig.json -s
systemctl restart amazon-cloudwatch-agent
`;

const base64Script = userData.apply(script => Buffer.from(script).toString('base64'));

const launchTemplate = new aws.ec2.LaunchTemplate("launchTemplate", {
  imageId: ami.id,
  instanceType: "t2.micro",
  keyName: keyName,
  networkInterfaces: [{
    associatePublicIpAddress: true,
    securityGroups: [appSecurityGroup.id],
  }],
  userData: base64Script,

  iamInstanceProfile: {
    name: instanceProfile.name,
  },
  blockDeviceMappings: [{
    deviceName: "/dev/xvda",
    ebs: {
      volumeSize: 25,
      volumeType: "gp2",
      deleteOnTermination: true,
    },
  }],
  tags: {
    Name: "Webapp instance",
  },
}, { provider: awsProvider });



// Auto Scaling Group
const autoScalingGroup = new aws.autoscaling.Group("autoScalingGroup", {
  minSize: 1,
  maxSize: 3,
  desiredCapacity: 1,
  launchTemplate: {
      id: launchTemplate.id,
      version: "$Latest",
  },
  vpcZoneIdentifiers: publicSubnetIds,
  targetGroupArns: [targetGroup.arn],
  cooldown: 60,
  tags: [{
      key: "Name",
      value: "MyASGInstance",
      propagateAtLaunch: true,
  }],
  healthCheckType: "EC2",
  healthCheckGracePeriod: 600,
}, { provider: awsProvider });

// Auto Scaling Policies
const scaleUpPolicy = new aws.autoscaling.Policy("scaleUpPolicy", {
  scalingAdjustment: 1,
  adjustmentType: "ChangeInCapacity",
  autoscalingGroupName: autoScalingGroup.name,
  cooldown: 120,
});

const scaleDownPolicy = new aws.autoscaling.Policy("scaleDownPolicy", {
  scalingAdjustment: -1,
  adjustmentType: "ChangeInCapacity",
  autoscalingGroupName: autoScalingGroup.name,
  cooldown: 120,
});


const cpuHighAlarm = new aws.cloudwatch.MetricAlarm("cpuHighAlarm", {
  metricName: "CPUUtilization",
  namespace: "AWS/EC2",
  statistic: "Average",
  period: 60,
  evaluationPeriods: 2,
  threshold: 5,
  comparisonOperator: "GreaterThanThreshold",
  alarmActions: [scaleUpPolicy.arn],
  dimensions: {
      AutoScalingGroupName: autoScalingGroup.name,
  },
});

const cpuLowAlarm = new aws.cloudwatch.MetricAlarm("cpuLowAlarm", {
  metricName: "CPUUtilization",
  namespace: "AWS/EC2",
  statistic: "Average",
  period: 60,
  evaluationPeriods: 2,
  threshold: 3,
  comparisonOperator: "LessThanThreshold",
  alarmActions: [scaleDownPolicy.arn],
  dimensions: {
      AutoScalingGroupName: autoScalingGroup.name,
  },
});


const zone = pulumi.output(aws.route53.getZone({ name: domainName, privateZone: false }, { provider: awsProvider }));


const loadBalancerDNSRecord = new aws.route53.Record("loadBalancerDNSRecord", {
  zoneId: zone.id,
  name: domainName  , 
  type: "A", 
  aliases: [{
      name: appLoadBalancer.dnsName,
      zoneId: appLoadBalancer.zoneId, 
      evaluateTargetHealth: true, 
  }],
}, { provider: awsProvider });


exports.loadBalancerDNSName = loadBalancerDNSRecord.name;
exports.loadBalancerSecurityGroupId = loadbalancerSecurityGroup.id;


